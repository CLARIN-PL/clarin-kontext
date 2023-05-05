# Copyright (c) 2023 Charles University, Faculty of Arts,
#                    Institute of the Czech National Corpus
# Copyright (c) 2023 Martin Zimandl <martin.zimandl@gmail.com>
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

from typing import Dict, List, Tuple

import plugins
from plugin_types.corparch import AbstractCorporaArchive
from plugin_types.kwic_row_connect import AbstractKwicRowConnect
from plugin_types.token_connect import AbstractBackend, AbstractFrontend
from plugins.default_token_connect import setup_providers
from sanic.blueprints import Blueprint
from util import as_async

bp = Blueprint('default_kwic_row_connect')


class DefaultKwicRowConnect(AbstractKwicRowConnect):

    def __init__(self, providers: Dict[str, Tuple[AbstractBackend, AbstractFrontend]], corparch: AbstractCorporaArchive):
        self._providers = providers
        self._corparch = corparch

    def map_providers(self, provider_ids):
        return [self._providers[ident] for ident in provider_ids]

    async def is_enabled_for(self, plugin_ctx, corpora):
        if len(corpora) == 0:
            return False
        corpus_info = await self._corparch.get_corpus_info(plugin_ctx, corpora[0])
        tst = [p.enabled_for_corpora([corpora[0]] + plugin_ctx.aligned_corpora)
               for p, _ in self.map_providers(corpus_info.kwic_row_connect.providers)]
        return len(tst) > 0 and True in tst

    @as_async
    def export(self, plugin_ctx):
        return {}

    @staticmethod
    def export_actions():
        return bp

    async def fetch_data(self, plugin_ctx, provider_ids, corpora, row, lang) -> List[Dict]:
        return []


@plugins.inject(plugins.runtime.DB, plugins.runtime.CORPARCH)
def create_instance(settings, db, corparch):
    providers = setup_providers(settings.get('plugins', 'kwic_row_connect'), db)
    plg_conf = settings.get('plugins', 'kwic_row_connect')
    kwic_conn = DefaultKwicRowConnect(providers, corparch)
    return kwic_conn