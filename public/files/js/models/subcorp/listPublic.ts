/*
 * Copyright (c) 2018 Charles University, Faculty of Arts,
 *                    Institute of the Czech National Corpus
 * Copyright (c) 2018 Tomas Machalek <tomas.machalek@gmail.com>
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

import * as Immutable from 'immutable';
import RSVP from 'rsvp';

import {PageModel} from '../../app/main';
import {ActionPayload, ActionDispatcher, SEDispatcher} from '../../app/dispatcher';
import {StatelessModel} from '../base';
import { MultiDict } from '../../util';
import { Kontext } from '../../types/common';

interface LoadDataResponse extends Kontext.AjaxResponse {
    data:Array<DataItem>;
    corpora:Array<CorpusItem>;
}

export interface DataItem {
    ident:string;
    origName:string;
    corpname:string;
    description:string;
    userId:number;
}

export interface CorpusItem {
    ident:string;
    label:string;
}

export interface PublicSubcorpListState {
    isBusy:boolean;
    data:Immutable.List<DataItem>;
    corpora:Immutable.List<CorpusItem>;
    corpname:string;
    codePrefix:string;
}

export enum Actions {
    SET_CORPUS_NAME = 'PUBSUBC_SET_CORPUS_NAME',
    SET_CODE_PREFIX = 'PUBSUBC_SET_CODE_PREFIX',
    DATA_LOAD_DONE = 'PUBSUBC_DATA_LOAD_DONE',
    RESET_FILTER = 'PUBSUBC_RESET_FILTER'
}


export class PublicSubcorpListModel extends StatelessModel<PublicSubcorpListState> {

    private pageModel:PageModel;

    constructor(dispatcher:ActionDispatcher, pageModel:PageModel, data:Array<DataItem>, corpora:Array<CorpusItem>) {
        super(
            dispatcher,
            {
                isBusy: false,
                data: Immutable.List<DataItem>(data),
                corpora: Immutable.List<CorpusItem>(corpora),
                corpname: '',
                codePrefix: ''
            }
        );
        this.pageModel = pageModel;
    }

    reduce(state:PublicSubcorpListState, action:ActionPayload):PublicSubcorpListState {
        let newState:PublicSubcorpListState;

        switch (action.actionType) {
            case Actions.SET_CORPUS_NAME:
                newState = this.copyState(state);
                newState.isBusy = true;
                newState.corpname = action.props['value'];
                return newState;
            case Actions.SET_CODE_PREFIX:
                newState = this.copyState(state);
                newState.isBusy = true;
                newState.codePrefix = action.props['value'];
                return newState;
            case Actions.DATA_LOAD_DONE:
                newState = this.copyState(state);
                newState.isBusy = false;
                newState.data = Immutable.List<DataItem>(action.props['data']['data']);
                return newState;
            default:
                return state;
        }
    }

    sideEffects(state:PublicSubcorpListState, action:ActionPayload, dispatch:SEDispatcher):void {

        switch (action.actionType) {
            case Actions.SET_CORPUS_NAME:
                this.loadData(state).then(
                    (data) => {
                        dispatch({
                            actionType: Actions.DATA_LOAD_DONE,
                            props: {
                                data: data
                            }
                        });
                    }

                ).catch(
                    (err) => {
                        this.pageModel.showMessage('error', err);
                        dispatch({
                            actionType: Actions.DATA_LOAD_DONE,
                            props: {},
                            error: err
                        });
                    }
                )
                //
            break;
            case Actions.SET_CODE_PREFIX:
                //
            break;
        }
    }

    private loadData(state:PublicSubcorpListState):RSVP.Promise<LoadDataResponse> {
        // TODO
        const args = new MultiDict();
        args.set('format', 'json');
        args.set('corpname', state.corpname);
        args.set('code_prefix', state.codePrefix);
        args.set('offset', 0); // TODO
        args.set('limit', 20); // TODO
        return this.pageModel.ajax<LoadDataResponse>(
            'GET',
            this.pageModel.createActionUrl('subcorpus/list_published'),
            args
        );
    }

}