# Copyright (c) 2020 Charles University, Faculty of Arts,
#                    Institute of the Czech National Corpus
# Copyright (c) 2020 Martin Zimandl <martin.zimandl@gmail.com>
# Copyright (c) 2020 Tomas Machalek <tomas.machalek@gmail.com>
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
from collections import defaultdict
from typing import Callable, Tuple

import bgcalc.freqs
import l10n
from conclib.freq import multi_level_crit
from conclib.pyconc import PyConc
from conclib.search import get_conc
from corplib import CorpusFactory
from corplib.corpus import KCorpus
from plugin_types.query_suggest import AbstractBackend
from strings import simple_query_escape
from util import as_sync


@as_sync
async def _load_corp_sync(name: str):
    return await CorpusFactory().get_corpus(name) if name else None


class PosAttrPairRelManateeBackend(AbstractBackend):

    def __init__(self, conf, ident, translate: Callable[[str], str] = lambda x: x):
        super().__init__(ident)
        self._conf = conf
        self._translate = translate
        fixed_corp = conf.get('corpus')
        self._preset_corp = _load_corp_sync(fixed_corp)

    def _freq_dist(self, corp: KCorpus, conc: PyConc, fcrit: str, user_id: int):
        args = bgcalc.freqs.FreqCalcArgs(
            corpname=corp.corpname,
            subcname=corp.subcorpus_id,
            subcpath=[],
            user_id=user_id,
            pagesize=100,
            samplesize=0,
            flimit=1,
            fcrit=[fcrit],
            ftt_include_empty=0,
            rel_mode=1,
            freq_sort='freq',
            collator_locale='en_US',  # TODO use data provided by corparch plg
            fmaxitems=1,
            fpage=1)
        freqs = [conc.xfreq_dist(
            cr, args.flimit, args.freq_sort, args.ftt_include_empty, args.rel_mode, args.collator_locale)
            for cr in args.fcrit]
        return freqs[0].Items

    def _normalize_multivalues(self, corp: KCorpus, srch_val: str, attr1: str, attr2: str) -> Tuple[str, str]:
        multisep1 = corp.get_conf(self._conf["attr1"] + '.MULTISEP')
        multisep2 = corp.get_conf(self._conf["attr2"] + '.MULTISEP')
        if multisep1 and multisep2:
            attr_pairs = list(zip(attr1.split(multisep1), attr2.split(multisep2)))
            if len(attr_pairs) > 1:
                for attr1c, attr2c in attr_pairs:
                    if srch_val.lower() == attr1c.lower() or srch_val.lower() == attr2c.lower():
                        return attr1c, attr2c
                logging.warning(
                    f'PosAttrPairRelManateeBackend multivalue normalization mismatch - {attr1}...{attr2}')

        return attr1, attr2

    def mk_query(self, icase, value_norm):
        q = []
        for i in range(1, 11):
            a = f'attr{i}'
            if a in self._conf:
                q.append('{}="{}{}"'.format(self._conf[a], icase, value_norm))
        return ' | '.join(q)

    async def find_suggestion(
            self, user_id, ui_lang, maincorp, corpora, subcorpus, value, value_type, value_subformat,
            query_type, p_attr, struct, s_attr):
        used_corp = self._preset_corp if self._preset_corp is not None else maincorp
        value_norm = value if value_subformat in ('regexp', 'advanced') else simple_query_escape(value)
        icase = '(?i)' if value_subformat in ('simple_ic',) else ''
        rels = defaultdict(lambda: set())
        try:
            conc = await get_conc(
                used_corp,
                user_id,
                (f'aword,[{self.mk_query(icase, value_norm)}]',))
            conc.sync()
            mlargs = dict(ml1attr=self._conf["attr1"], ml2attr=self._conf["attr2"])
            fcrit = multi_level_crit(2, mlargs)
            data = self._freq_dist(corp=used_corp, conc=conc, fcrit=fcrit, user_id=user_id)
            for item in data:
                attr1, attr2 = self._normalize_multivalues(
                    used_corp, value_norm, *(tuple([w['n'] for w in item.Word])[:2]))
                rels[attr1].add(attr2)
        except RuntimeError as ex:
            msg = str(ex).lower()
            if 'syntax error' not in msg:
                raise ex
        return dict(attrs=(self._conf['attr1'], self._conf['attr2']),
                    data=dict((k, l10n.sort(v, ui_lang, key=lambda itm: itm, reverse=False))
                              for k, v in rels.items()))
