# Copyright (c) 2013 Charles University, Faculty of Arts,
#                    Institute of the Czech National Corpus
# Copyright (c) 2022 Tomas Machalek <tomas.machalek@gmail.com>
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

from sanic.request import Request
from sanic import HTTPResponse, Sanic
from sanic import response
from typing import Optional, Union, Callable, Any, Type, Coroutine, List
from functools import wraps
from action.templating import CustomJSONEncoder, TplEngine, ResultType
from action.props import ActionProps
from action.theme import apply_theme
from action.krequest import KRequest
from action.response import KResponse
from dataclasses_json import DataClassJsonMixin
from action.errors import ImmediateRedirectException, UserActionException
from action.model.base import PageConstructor, BaseActionModel
import json


async def _output_result(
        app: Sanic,
        action_model: PageConstructor,
        action_props: ActionProps,
        tpl_engine: TplEngine,
        translate: Callable[[str], str],
        result: ResultType,
        status: int,
        return_type: str) -> Union[str, bytes]:
    """
    Renders a response body out of a provided data (result). The concrete form of data transformation
    depends on the combination of the 'return_type' argument and a type of the 'result'.
    Typical combinations are (ret. type, data type):
    'template' + dict
    'json' + dict (which may contain dataclass_json instances)
    'json' + dataclass_json
    'plain' + str
    A callable 'result' can be used for lazy result evaluation or for JSON encoding with a custom encoder
    """
    if 300 <= status < 400 or result is None:
        return ''
    if callable(result):
        result = result()
    if return_type == 'json':
        try:
            if type(result) in (str, bytes):
                return result
            else:
                return json.dumps(result, cls=CustomJSONEncoder)
        except Exception as e:
            return json.dumps(dict(messages=[('error', str(e))]))
    elif return_type == 'xml':
        from templating import Type2XML
        return Type2XML.to_xml(result)
    elif return_type == 'plain' and not isinstance(result, (dict, DataClassJsonMixin)):
        return result
    elif isinstance(result, dict):
        result = await action_model.add_globals(app, action_props, result)
        apply_theme(result, app, translate)
        action_model.init_menu(result)
        return tpl_engine.render(action_props.template, result)
    raise RuntimeError(
        f'Unsupported result and result_type combination: {result.__class__.__name__},  {return_type}')


def create_mapped_args(tp: Type, req: Request):
    """
    Create an instance of a (dataclass) Type based on req arguments.
    Please note that the Type should contain only str/List[str] and int/List[int] values.

    TODO handle Optional vs. default_factory etc.
    """
    props = tp.__annotations__
    data = {}
    for mk, mtype in props.items():
        v = req.args.getlist(mk, [])
        if len(v) == 0:
            v = req.form.get(mk, [])
        if mtype == str:
            if len(v) == 0:
                raise UserActionException(f'Missing request argument {mk}')
            elif len(v) > 1:
                raise UserActionException(f'Argument {mk} is cannot be multi-valued')
            data[mk] = v[0]
        elif mtype == Union[str, None]:
            if len(v) > 1:
                raise UserActionException(f'Argument {mk} is cannot be multi-valued')
            elif len(v) == 1:
                data[mk] = v[0]
        elif mtype == List[str]:
            if len(v) == 0:
                raise UserActionException(f'Missing request argument {mk}')
            data[mk] = v
        elif mtype == Union[List[str], None]:
            if len(v) > 0:
                data[mk] = v
        elif mtype == int:
            if len(v) == 0:
                raise UserActionException(f'Missing request argument {mk}')
            elif len(v) > 1:
                raise UserActionException(f'Argument {mk} is cannot be multi-valued')
            data[mk] = int(v[0])
        elif mtype == Union[int, None]:
            if len(v) > 1:
                raise UserActionException(f'Argument {mk} is cannot be multi-valued')
            elif len(v) == 1:
                data[mk] = int(v[0])
        elif mtype == List[int]:
            if len(v) == 0:
                raise UserActionException(f'Missing request argument {mk}')
            data[mk] = [int(x) for x in v]
        elif mtype == Union[List[int], None]:
            if len(v) > 0:
                data[mk] = [int(x) for x in v]
    return tp(**data)


async def resolve_error(
        amodel: BaseActionModel, action_props: ActionProps, req: KRequest, resp: KResponse, err: Exception):
    """
    resolve_error provides a way how to finish an action with some
    reasonable output in case the action has thrown an error.
    """

    ans = {
        'last_used_corp': dict(corpname=None, human_corpname=None),
        'Q': []
    }
    await amodel.resolve_error_state(req, resp, ans, err)
    if isinstance(err, UserActionException):
        resp.set_http_status(err.code)

    if action_props.return_type == 'template':
        return ans
    elif action_props.return_type == 'plain':
        return str(err)
    elif action_props.return_type == 'json':
        return json.dumps(ans)


def http_action(
        access_level: int = 0,
        template: Optional[str] = None,
        action_model: Optional[Type[BaseActionModel]] = None,
        page_model: Optional[str] = None,
        mapped_args: Optional[Type] = None,
        mutates_result: bool = False,
        apply_semi_persist_args: bool = False,
        return_type: str = 'template',
        action_log_mapper: Callable[[Request], Any] = False):
    """
    http_action decorator wraps Sanic view functions to provide more
    convenient arguments (including important action models). KonText
    action function has a signature:

    def some_action(action_model: BaseActionModel, req: KRequest, resp: KResponse) -> ResultType

    arguments:
    access_level -- 0,1,... (0 = public user, 1 = logged in user)
    template -- a Jinja2 template source path (a relative path starting in the 'templates' dir)
    action_model -- a model providing functions for handling user session (session in a general sense),
                    accessing corpora and misc. search results
    page_model -- a JavaScript page module
    mapped_args -- any class (typically, a dataclass) request arguments will be mapped to; the class must
                   provide one of the following typed arguments: int, List[int], str, List[str].
                   All the values can be also Optional.
    mutates_result -- If set to True, then after a respective action a configured action model is notified
                      it should store actual result data. This is particularly important for concordance
                      actions like filters, sorting etc. where the concordance changes based on the previous
                      state.
    apply_semi_persist_args -- if True hen use session to initialize action args first
    return_type -- specifies how the result data should be interpreted for the client {plain, json, template, xml}.
                   In some cases, a single result type (typically a Dict) can be transformed into multiple formats
                   (html page, xml file, json file, plain text file) but in other cases the choice is limited
                   (e.g. when returning some binary data, only 'plain' return_type makes sense)
    """
    def decorator(func: Callable[[BaseActionModel, KRequest, KResponse], Coroutine[Any, Any, Optional[ResultType]]]):
        @wraps(func)
        async def wrapper(request: Request, *args, **kw):
            application = Sanic.get_app('kontext')
            app_url_prefix = application.config['action_path_prefix']
            if request.path.startswith(app_url_prefix):
                norm_path = request.path[len(app_url_prefix):]
            else:
                norm_path = request.path
            path_elms = norm_path.split('/')
            action_name = path_elms[-1]
            action_prefix = '/'.join(path_elms[:-1]) if len(path_elms) > 1 else ''
            aprops = ActionProps(
                action_name=action_name, action_prefix=action_prefix, access_level=access_level,
                return_type=return_type, page_model=page_model, template=template,
                mutates_result=mutates_result)
            if mapped_args:
                marg = create_mapped_args(mapped_args, request)
            else:
                marg = None
            req = KRequest(request, app_url_prefix, marg)
            resp = KResponse(
                root_url=req.get_root_url(),
                redirect_safe_domains=application.config['redirect_safe_domains'],
                cookies_same_site=application.config['cookies_same_site']
            )
            if action_model:
                amodel = action_model(req, resp, aprops, application.ctx.tt_cache)
            else:
                amodel = BaseActionModel(req, resp, aprops, application.ctx.tt_cache)

            try:
                amodel.init_session()
                await amodel.pre_dispatch(None)
                ans = await func(amodel, req, resp)
                await amodel.post_dispatch(aprops, ans, None)  # TODO error desc
            except ImmediateRedirectException as ex:
                return response.redirect(ex.url, status=ex.code)
            except Exception as ex:
                if aprops.template:
                    aprops.template = 'message.html'
                    aprops.page_model = 'message'
                ans = await resolve_error(amodel, aprops, req, resp, ex)
                resp.add_system_message('error', str(ex))

            return HTTPResponse(
                body=await _output_result(
                    app=application,
                    action_model=amodel,
                    action_props=aprops,
                    tpl_engine=application.ctx.templating,
                    translate=req.translate,
                    result=ans,
                    status=resp.http_status_code,
                    return_type=aprops.return_type),
                status=resp.http_status_code,
                headers=resp.output_headers(return_type))

        return wrapper
    return decorator
