from typing import Dict, Any
from sanic import Blueprint
from action.decorators import http_action
from action.errors import FunctionNotSupported, ImmediateRedirectException, CorpusForbiddenException
from action.krequest import KRequest
from action.model.authorized import UserActionModel
from action.response import KResponse

import settings
import plugins
import bgcalc


bp = Blueprint('root')


@bp.route('/')
@http_action()
async def root_action(amodel, req, resp):
    raise ImmediateRedirectException(req.create_url('query', {}))


async def _check_tasks_status(amodel: UserActionModel, req: KRequest, resp: KResponse) -> Dict[str, Any]:
    backend = settings.get('calc_backend', 'type')
    if backend in ('celery', 'rq'):
        worker = bgcalc.calc_backend_client(settings)
        at_list = amodel.get_async_tasks()
        upd_list = []
        for at in at_list:
            r = worker.AsyncResult(at.ident)
            if r:
                at.status = r.status
                if at.status == 'FAILURE':
                    if hasattr(r.result, 'message'):
                        at.error = r.result.message
                    else:
                        at.error = str(r.result)
            else:
                at.status = 'FAILURE'
                at.error = 'job not found'
            upd_list.append(at)
        amodel.mark_timeouted_tasks(*upd_list)
        amodel.set_async_tasks(upd_list)
        return dict(data=[d.to_dict() for d in upd_list])
    else:
        raise FunctionNotSupported(f'Backend {backend} does not support status checking')


@bp.route('/check_tasks_status')
@http_action(return_type='json', action_model=UserActionModel)
async def check_tasks_status(amodel: UserActionModel, req: KRequest, resp: KResponse) -> Dict[str, Any]:
    return await _check_tasks_status(amodel, req, resp)


@bp.route('/get_task_result')
@http_action(return_type='json')
async def get_task_result(amodel, req, resp):
    worker = bgcalc.calc_backend_client(settings)
    result = worker.AsyncResult(req.args.get('task_id'))
    return dict(result=result.get())


@bp.route('/remove_task_info', methods=['DELETE'])
@http_action(return_type='json', action_model=UserActionModel)
async def remove_task_info(amodel: UserActionModel, req: KRequest, resp: KResponse) -> Dict[str, Any]:
    task_ids = req.form.getlist('tasks')
    amodel.set_async_tasks([x for x in amodel.get_async_tasks() if x.ident not in task_ids])
    return await _check_tasks_status(amodel, req, resp)


@bp.exception(CorpusForbiddenException, Exception)
@bp.route('/message')
@http_action(page_model='message', template='message.html', action_model=UserActionModel)
async def message(amodel: UserActionModel, req: KRequest, resp: KResponse):
    # TODO kwargs... replace with mapped args
    kw['last_used_corp'] = dict(corpname=None, human_corpname=None)
    if amodel.cm:
        with plugins.runtime.QUERY_HISTORY as qh:
            queries = await qh.get_user_queries(amodel.session_get('user', 'id'), amodel.cm, limit=1, translate=req.translate)
            if len(queries) > 0:
                kw['last_used_corp'] = dict(
                    corpname=queries[0].get('corpname', None),
                    human_corpname=queries[0].get('human_corpname', None))
    kw['popup_server_messages'] = False
    return kw


@bp.route('/message_json')
@http_action(return_type='json')
async def message_json(amodel, req, resp):
    return await message(amodel, req, resp)


@bp.route('/message_xml')
@http_action(return_type='xml')
async def message_xml(amodel, req, resp):
    return await message(amodel, req, resp)


@bp.route('/compatibility')
@http_action(template='compatibility.html')
async def compatibility(amodel, req, resp):
    return {}
