# Copyright (c) 2022 Charles University in Prague, Faculty of Arts,
#                    Institute of the Czech National Corpus
# Copyright (c) 2022 Tomas Machalek <tomas.machalek@gmail.com>
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

from sanic.blueprints import Blueprint
from plugin_types.backlinks import AbstractBacklinks
from action.control import http_action
from action.krequest import KRequest
from action.response import KResponse
from action.model.concordance import ConcActionModel
from views.concordance import view_conc

bp = Blueprint('ucnk_backlinks', url_prefix='b')


def col_lemma_log(request: KRequest):
    return dict(
        corpname=request.args.get('corpname'), maincorp=request.args.get('maincorp'),
        viewmode=request.args.get('viewmode'), pagesize=request.args.get('pagesize'),
        attrs=request.args.get('attrs'), attr_vmode=request.args.get('attrs_vmode'),
        q=request.args.get('q'))


@bp.route('/col_lemma')
@http_action(
    mutates_result=False, action_log_mapper=col_lemma_log, template='view.html', page_model='view',
    action_model=ConcActionModel)
async def view(amodel: ConcActionModel, req: KRequest, resp: KResponse):
    """
    """
    amodel.args.q = [
        'q[col_lemma="{cl}"][]*[col_lemma="{cl}"] within <s />'.format(cl=req.args.get('cl')),
        'D',
        'f']
    return await view_conc(amodel, req, resp, False, req.session_get('user', 'id'))


class UcnkBacklinks(AbstractBacklinks):

    def export_actions(self) -> Blueprint:
        return bp


def create_instance(settings) -> UcnkBacklinks:
    return UcnkBacklinks()
