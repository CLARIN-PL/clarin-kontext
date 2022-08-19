# Copyright(c) 2015 Charles University, Faculty of Arts,
#                   Institute of the Czech National Corpus
# Copyright(c) 2015 Tomas Machalek <tomas.machalek@gmail.com>
# Copyright(c) 2022 Martin Zimandl <martin.zimandl@gmail.com>
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

# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

import os
from typing import Any, Dict

import bgcalc
import plugins
import settings
from action.argmapping.subcorpus import (
    CreateSubcorpusArgs, CreateSubcorpusRawCQLArgs, CreateSubcorpusWithinArgs)
from action.errors import FunctionNotSupported, UserActionException
from action.model.corpus import CorpusActionModel
from bgcalc.task import AsyncTaskStatus
from corplib.abstract import create_new_subc_ident
from corplib.subcorpus import create_subcorpus
from texttypes.model import TextTypeCollector


class SubcorpusError(Exception):
    pass


class SubcorpusActionModel(CorpusActionModel):

    TASK_TIME_LIMIT = settings.get_int('calc_backend', 'task_time_limit', 300)

    async def create_subcorpus(self) -> Dict[str, Any]:
        """
        req. arguments:
        subcname -- name of new subcorpus
        create -- bool, sets whether to create new subcorpus
        cql -- custom within condition
        """
        form_type = self._req.json['form_type']
        author = self.session_get('user', 'id')
        tt_query = None

        if form_type == 'tt-sel':
            specification = CreateSubcorpusArgs(**self._req.json)
            corpus_info = await self.get_corpus_info(specification.corpname)
            if (plugins.runtime.LIVE_ATTRIBUTES.exists
                    and await plugins.runtime.LIVE_ATTRIBUTES.instance.is_enabled_for(
                        self.plugin_ctx, [specification.corpname])  # TODO here we skip aligned corpora which is debatable
                    and len(specification.aligned_corpora) > 0):
                if corpus_info.metadata.label_attr and corpus_info.metadata.id_attr:
                    sel_match = await plugins.runtime.LIVE_ATTRIBUTES.instance.get_attr_values(
                        self.plugin_ctx, corpus=self.corp,
                        attr_map=specification.text_types,
                        aligned_corpora=specification.aligned_corpora,
                        limit_lists=False)
                    sel_attrs = {}
                    for k, vals in sel_match.attr_values.items():
                        if k == corpus_info.metadata.label_attr:
                            k = corpus_info.metadata.id_attr
                        # now we take only attribute entries with full data listing
                        if '.' in k and type(vals) is list:
                            sel_attrs[k] = [v[1] for v in vals]
                    tt_query = TextTypeCollector(self.corp, sel_attrs).get_query()
                    tmp = ['<%s %s />' % item for item in tt_query]
                    full_cql = ' within '.join(tmp)
                    specification.text_types_cql = f'aword,[] within {full_cql}'
                else:
                    raise FunctionNotSupported(
                        'Corpus must have a bibliography item defined to support this function')
            else:
                tt_query = TextTypeCollector(self.corp, specification.text_types).get_query()
                tmp = ['<%s %s />' % item for item in tt_query]
                full_cql = ' within '.join(tmp)
                specification.text_types_cql = f'aword,[] within {full_cql}'
        elif form_type == 'within':
            specification = CreateSubcorpusWithinArgs(aligned_corpora=[], **self._req.json)
        elif form_type == 'cql':
            specification = CreateSubcorpusRawCQLArgs(**self._req.json)
        else:
            raise UserActionException(f'Invalid form type provided - "{form_type}"')
        if not specification.subcname:
            raise UserActionException(self._req.translate('No subcorpus name specified!'))

        subc_id = await create_new_subc_ident(self.subcpath, self.corp.corpname)
        full_path = os.path.join(self.subcpath, subc_id.data_path)
        if tt_query and len(tt_query) == 1 and not specification.has_aligned_corpora():
            await create_subcorpus(full_path, self.corp, tt_query[0][0], tt_query[0][1])
            subc = await self.cf.get_corpus(subc_id)
            with plugins.runtime.SUBC_STORAGE as sr:
                await sr.create(
                    ident=subc_id.id,
                    user_id=author,
                    corpname=self.args.corpname,
                    subcname=specification.subcname,
                    size=subc.search_size,
                    public_description=specification.description,
                    data=specification)
        else:
            worker = bgcalc.calc_backend_client(settings)
            res = await worker.send_task(
                'create_subcorpus',
                object.__class__,
                (author, specification, subc_id, full_path),
                time_limit=self.TASK_TIME_LIMIT)
            self.store_async_task(AsyncTaskStatus(
                status=res.status, ident=res.id, category=AsyncTaskStatus.CATEGORY_SUBCORPUS,
                label=f'{self.args.corpname}/{specification.subcname}',
                args=dict(
                    subcname=specification.subcname,
                    corpname=self.args.corpname
                )))

        unfinished_corpora = [at for at in self.get_async_tasks(
            category=AsyncTaskStatus.CATEGORY_SUBCORPUS) if not at.is_finished()]
        return dict(processed_subc=[uc.to_dict() for uc in unfinished_corpora])
