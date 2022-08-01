# Copyright (c) 2015 Charles University, Faculty of Arts,
#                    Institute of the Czech National Corpus
# Copyright (c) 2015 Tomas Machalek <tomas.machalek@gmail.com>
# Copyright(c) 2021 Martin Zimandl <martin.zimandl@gmail.com>
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; version 2
# dated June, 1991.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.


import logging
import os
from dataclasses import asdict, dataclass
from typing import Any, Dict, List

import l10n
import plugins
import settings
from action.argmapping import log_mapping
from action.argmapping.action import IntOpt
from action.decorators import http_action
from action.errors import UserActionException
from action.krequest import KRequest
from action.model.corpus import CorpusActionModel
from action.model.subcorpus import SubcorpusActionModel, SubcorpusError
from action.model.user import UserActionModel
from action.response import KResponse
from bgcalc.task import AsyncTaskStatus
from corplib.abstract import SubcorpusIdent
from corplib.subcorpus import SubcorpusRecord
from main_menu.model import MainMenu
from plugin_types.subc_storage import AbstractSubcArchive, SubcListFilterArgs
from sanic import Blueprint
from texttypes.model import TextTypeCollector

bp = Blueprint('subcorpus', url_prefix='subcorpus')


@bp.route('/properties')
@http_action(
    access_level=1, return_type='json', action_model=CorpusActionModel)
async def properties(amodel: SubcorpusActionModel, req: KRequest, resp: KResponse):
    corp_ident = amodel.corp.portable_ident
    struct_and_attrs = await amodel.get_structs_and_attrs()
    with plugins.runtime.SUBC_STORAGE as sr:
        info = await sr.get_info(corp_ident.id)
    live_attrs_enabled = False
    with plugins.runtime.LIVE_ATTRIBUTES as la:
        live_attrs_enabled = info.text_types is not None and await la.is_enabled_for(amodel.plugin_ctx, [corp_ident.corpus_name])
    return {
        'data': info.to_dict(),
        'textTypes': await amodel.tt.export_with_norms(),
        'structsAndAttrs': {k: [x.to_dict() for x in item] for k, item in struct_and_attrs.items()},
        'liveAttrsEnabled': live_attrs_enabled,
    }


@bp.route('/create', ['POST'])
@http_action(
    access_level=1, return_type='json', action_log_mapper=log_mapping.new_subcorpus, action_model=SubcorpusActionModel)
async def create(amodel: SubcorpusActionModel, req: KRequest, resp: KResponse):
    try:
        return await amodel.create_subcorpus()
    except (SubcorpusError, RuntimeError) as e:
        raise UserActionException(str(e)) from e


@bp.route('/new')
@http_action(access_level=1, template='subcorpus/new.html', page_model='subcorpForm', action_model=CorpusActionModel)
async def new(amodel: CorpusActionModel, req: KRequest, resp: KResponse):
    """
    Displays a form to create a new subcorpus
    """
    amodel.disabled_menu_items = amodel.CONCORDANCE_ACTIONS + (MainMenu.VIEW, )
    method = req.form.get('method', 'gui')
    subcname = req.form.get('subcname', None)
    subcnorm = req.args.get('subcnorm', 'tokens')

    try:
        tt_sel = await amodel.tt.export_with_norms(subcnorm=subcnorm)
    except UserActionException as e:
        tt_sel = {'Normslist': [], 'Blocks': []}
        resp.add_system_message('warning', e)

    out = dict(SubcorpList=())
    await amodel.attach_aligned_query_params(out)
    corpus_info = await amodel.get_corpus_info(amodel.args.corpname)

    out.update(dict(
        Normslist=tt_sel['Normslist'],
        text_types_data=tt_sel,
        selected_text_types=TextTypeCollector(amodel.corp, req).get_attrmap(),
        method=method,
        subcnorm=subcnorm,
        id_attr=corpus_info.metadata.id_attr,
        subcname=subcname,
        aligned_corpora=req.form_getlist('aligned_corpora')
    ))
    return out


@bp.route('/ajax_create_subcorpus', ['POST'])
@http_action(access_level=1, return_type='json', action_model=SubcorpusActionModel)
async def ajax_create_subcorpus(amodel: SubcorpusActionModel, req: KRequest, resp: KResponse) -> Dict[str, Any]:
    return await amodel.create_subcorpus()


@bp.route('/archive', ['POST'])
@http_action(access_level=1, return_type='json', action_model=CorpusActionModel)
async def delete(amodel: CorpusActionModel, req: KRequest, resp: KResponse):
    corp_ident = amodel.corp.portable_ident
    if isinstance(corp_ident, SubcorpusIdent):
        with plugins.runtime.SUBC_STORAGE(AbstractSubcArchive) as sr:
            dt = await sr.archive(amodel.plugin_ctx.user_id, corp_ident.corpus_name, corp_ident.id)

    return {'archived': dt.timestamp()}


@bp.route('/restore', ['POST'])
@http_action(access_level=1, return_type='json', action_model=CorpusActionModel)
async def restore(amodel: CorpusActionModel, req: KRequest, resp: KResponse):
    corp_ident = amodel.corp.portable_ident
    if isinstance(corp_ident, SubcorpusIdent):
        with plugins.runtime.SUBC_STORAGE(AbstractSubcArchive) as sr:
            await sr.restore(amodel.plugin_ctx.user_id, corp_ident.corpus_name, corp_ident.id)

    return {}


@bp.route('/list')
@http_action(access_level=1, template='subcorpus/list.html', page_model='subcorpList', action_model=UserActionModel)
async def list_subcorpora(amodel: UserActionModel, req: KRequest, resp: KResponse) -> Dict[str, Any]:
    """
    Displays a list of user subcorpora. In case there is a 'subc_storage' plug-in
    installed then the list is enriched by additional re-use/undelete information.
    """
    amodel.disabled_menu_items = (
        MainMenu.VIEW, MainMenu.FILTER, MainMenu.FREQUENCY, MainMenu.COLLOCATIONS, MainMenu.SAVE, MainMenu.CONCORDANCE)

    active_only = False if bool(int(req.args.get('show_archived', 0))) else True
    filter_args = SubcListFilterArgs(
        active_only=active_only, archived_only=False, corpus=req.args.get('corpname'))

    with plugins.runtime.SUBC_STORAGE(AbstractSubcArchive) as sr:
        try:
            full_list: List[SubcorpusRecord] = await sr.list(amodel.plugin_ctx.user_id, filter_args)
        except Exception as e:
            logging.getLogger(__name__).error(
                'subc_storage plug-in failed to list queries: %s' % e)

    sort = req.args.get('sort', '-created')
    sort_key, rev = amodel.parse_sorting_param(sort)
    if sort_key in ('size', 'created'):
        full_list = sorted(full_list, key=lambda x: getattr(x, sort_key), reverse=rev)
    else:
        full_list = l10n.sort(full_list, loc=req.ui_lang,
                              key=lambda x: getattr(x, sort_key), reverse=rev)

    if filter_args.corpus is None:
        filter_args.corpus = ''  # JS code requires non-null value

    ans = dict(
        SubcorpList=[],   # this is used by subcorpus SELECT element; no need for that here
        subcorp_list=[x.to_dict() for x in full_list],
        sort_key=dict(name=sort_key, reverse=rev),
        filter=asdict(filter_args),
        processed_subc=[
            v.to_dict()
            for v in amodel.get_async_tasks(category=AsyncTaskStatus.CATEGORY_SUBCORPUS)
        ],
        related_corpora=sorted(list(set(x.corpus_name for x in full_list))),
        uses_subc_storage=plugins.runtime.SUBC_STORAGE.exists,
        uses_live_attrs=plugins.runtime.LIVE_ATTRIBUTES.exists,
    )
    return ans


@bp.route('/delete', ['POST'])
@http_action(access_level=1, return_type='json', action_model=CorpusActionModel)
async def delete(amodel: CorpusActionModel, req: KRequest, resp: KResponse) -> Dict[str, Any]:
    corp_ident = amodel.corp.portable_ident
    with plugins.runtime.SUBC_STORAGE as sr:
        await sr.delete_query(amodel.session_get('user', 'id'), corp_ident.corpus_name, corp_ident.id)

    try:
        os.unlink(os.path.join(settings.get('corpora', 'subcorpora_dir'), corp_ident.data_path))
    except IOError as e:
        logging.getLogger(__name__).warning(e)

    resp.add_system_message(
        'info',
        req.translate(f'Subcorpus {corp_ident.id} has been deleted permanently.')
    )
    return {}


@bp.route('/update_public_desc', ['POST'])
@http_action(access_level=1, return_type='json', action_model=CorpusActionModel)
async def update_public_desc(amodel: CorpusActionModel, req: KRequest, resp: KResponse) -> Dict[str, Any]:
    with plugins.runtime.SUBC_STORAGE as sa:
        preview_only = req.args.get('preview-only') == '1'
        preview = await sa.update_description(
            amodel.session_get('user', 'id'), amodel.corp.subcorpus_id, req.form.get('description'), preview_only)
    return dict(preview=preview, saved=not preview_only)


@dataclass
class _PublicListArgs(SubcListFilterArgs):
    offset: IntOpt = 0
    limit: IntOpt = 20


@bp.route('/list_published')
@http_action(
    template='subcorpus/list_published.html', page_model='pubSubcorpList', action_model=UserActionModel,
    mapped_args=_PublicListArgs)
async def list_published(amodel: UserActionModel, req: KRequest[_PublicListArgs], resp: KResponse) -> Dict[str, Any]:
    amodel.disabled_menu_items = (
        MainMenu.VIEW, MainMenu.FILTER, MainMenu.FREQUENCY, MainMenu.COLLOCATIONS, MainMenu.SAVE, MainMenu.CONCORDANCE)
    min_query_size = 3
    with plugins.runtime.SUBC_STORAGE as sr:
        if not req.mapped_args.ia_query or len(req.mapped_args.ia_query) < 3:
            items = []
        else:
            items = await sr.list(
                amodel.session_get('user', 'id'), req.mapped_args, req.mapped_args.offset, req.mapped_args.limit)
    return dict(data=[v.to_dict() for v in items], min_query_size=min_query_size)
