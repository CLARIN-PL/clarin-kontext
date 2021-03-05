/*
 * Copyright (c) 2021 Charles University, Faculty of Arts,
 *                    Institute of the Czech National Corpus
 * Copyright (c) 2021 Tomas Machalek <tomas.machalek@gmail.com>
 * Copyright (c) 2021 Martin Zimandl <martin.zimandl@gmail.com>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; version 2
 * dated June, 1991.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.

 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import { List } from 'cnc-tskit';
import { IActionDispatcher, StatelessModel } from 'kombo';
import { PageModel } from '../../app/page';
import { Actions, ActionName } from './actions';
import { PqueryResult } from './common';


export interface PqueryResultModelState {
    isBusy:boolean;
    isVisible:boolean;
    data:PqueryResult;
    queryId:string|undefined;
    sortKey:SortKey;
}

export type SortColumn = 'freq'|'value';

export interface SortKey {
    column:SortColumn;
    reverse:boolean;
}


export class PqueryResultModel extends StatelessModel<PqueryResultModelState> {

    private readonly layoutModel:PageModel;

    constructor(dispatcher:IActionDispatcher, initState:PqueryResultModelState, layoutModel:PageModel) {
        super(dispatcher, initState);
        this.layoutModel = layoutModel;

        this.addActionHandler<Actions.SubmitQuery>(
            ActionName.SubmitQuery,
            (state, action) => {
                state.isBusy = true;
                state.data = [];
            }
        );

        this.addActionHandler<Actions.SubmitQueryDone>(
            ActionName.SubmitQueryDone,
            (state, action) => {
                state.isBusy = false;
                state.queryId = action.payload.queryId;
            }
        );

        this.addActionHandler<Actions.SortLines>(
            ActionName.SortLines,
            (state, action) => {
                state.sortKey = action.payload;
                this.sortData(state);
            }
        );

        this.addActionHandler<Actions.AsyncResultRecieved>(
            ActionName.AsyncResultRecieved,
            (state, action) => {
                state.data = action.payload.data;
                this.sortData(state)
                state.isVisible = true;
            }
        )
    }

    private sortData(state:PqueryResultModelState) {
        switch (state.sortKey.column) {
            case 'value':
                state.data = List.sortAlphaBy(v => v[0], state.data);
                break;
            case 'freq':
                state.data = List.sortBy(v => v[1], state.data);
                break;
        }
        if (state.sortKey.reverse) {
            state.data = List.reverse(state.data);
        }
    }
}