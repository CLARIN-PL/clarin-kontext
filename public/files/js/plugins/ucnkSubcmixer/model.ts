/*
 * Copyright (c) 2015 Charles University, Faculty of Arts,
 *                    Institute of the Czech National Corpus
 * Copyright (c) 2015 Tomas Machalek <tomas.machalek@gmail.com>
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

import { IActionDispatcher, StatelessModel } from 'kombo';
import { Observable, throwError as rxThrowError } from 'rxjs';
import { pipe, Dict, List, HTTP, tuple } from 'cnc-tskit';

import { Kontext, TextTypes } from '../../types/common';
import { IPluginApi } from '../../types/plugins';
import { validateSubcProps } from '../../models/subcorp/form';
import { Actions, ActionName } from './actions';
import { SubcMixerExpression, CalculationResults, CalculationResponse, TextTypeAttrVal } from './common';
import { Actions as QueryActions, ActionName as QueryActionName } from '../../models/query/actions';


export interface SubcMixerModelState {
    currentSubcname:Kontext.FormValue<string>;
    shares:Array<SubcMixerExpression>;
    currentResult:CalculationResults|null;
    corpusIdAttr:string;
    alignedCorpora:Array<string>;
    ratioLimit:number;
    isBusy:boolean;
    isVisible:boolean;
    subcIsPublic:boolean;
    subcDescription:Kontext.FormValue<string>;
    numOfErrors:number;
    ttAttributes:Array<TextTypes.AttributeSelection>; // basically a copy of text type model attributes
    ttInitialAvailableValues:Array<TextTypes.AttributeSelection>;
    liveattrsSelections:{[key:string]:Array<string>};
}

/**
 *
 */
export class SubcMixerModel extends StatelessModel<SubcMixerModelState> {

    static DispatchToken:string;

    private readonly pluginApi:IPluginApi;

    constructor(
            dispatcher:IActionDispatcher,
            pluginApi:IPluginApi,
            initialState:SubcMixerModelState) {
        super(dispatcher, initialState);
        this.pluginApi = pluginApi;

        this.addActionHandler<QueryActions.QueryInputAddAlignedCorpus>(
            QueryActionName.QueryInputAddAlignedCorpus,
            (state, action) => {
                // TODO
            }
        );

        this.addActionHandler<QueryActions.QueryInputRemoveAlignedCorpus>(
            QueryActionName.QueryInputRemoveAlignedCorpus,
            (state, action) => {
                // TODO
            }
        );

        this.addActionHandler(
            'TT_SELECTION_CHANGED', // TODO type
            (state, action) => {
                state.ttAttributes = action.payload['attributes'];
            }
        );

        this.addActionHandler(
            'SUBCORP_FORM_SET_SUBCNAME',
            (state, action) => {
                state.currentSubcname = Kontext.updateFormValue(state.currentSubcname, {value: action.payload['value']});
            }
        );

        this.addActionHandler(
            'SUBCORP_FORM_SET_SUBC_AS_PUBLIC',
            (state, action) => {
                state.subcIsPublic = !!action.payload['value'];
            }
        );

        this.addActionHandler(
            'SUBCORP_FORM_SET_DESCRIPTION',
            (state, action) => {
                state.subcDescription = Kontext.updateFormValue(state.subcDescription, {value: action.payload['value']});
            }
        );

        this.addActionHandler(
            'LIVE_ATTRIBUTES_REFINE_DONE',
            (state, action) => {
                const newSelections:TextTypes.ServerCheckedValues = action.payload['selectedTypes'];
                state.liveattrsSelections = {
                    ...state.liveattrsSelections,
                    ...newSelections,
                };
            }
        );

        this.addActionHandler<Actions.ShowWidget>(
            ActionName.ShowWidget,
            (state, action) => {
                state.isVisible = true;
                this.refreshData(state);
            }
        );

        this.addActionHandler<Actions.HideWidget>(
            ActionName.HideWidget,
            (state, action) => {
                state.isVisible = false;
                state.currentResult = null;
            }
        );

        this.addActionHandler<Actions.SetRatio>(
            ActionName.SetRatio,
            (state, action) => {
                this.updateRatio(
                    state,
                    action.payload.attrName,
                    action.payload.attrValue,
                    Kontext.newFormValue(action.payload.ratio, true)
                );
            },
            (state, action, dispatch) => {
                const err = this.validateRatio(action.payload.ratio);
                if (err !== null) {
                    this.pluginApi.showMessage('error', err);
                    dispatch<Actions.SetRatioValidate>({
                        name: ActionName.SetRatioValidate,
                        payload: {
                            attrName: action.payload.attrName,
                            attrValue: action.payload.attrValue,
                            isInvalid: true
                        }
                    });
                }
            }
        );

        this.addActionHandler<Actions.SetRatioValidate>(
            ActionName.SetRatioValidate,
            (state, action) => {
                const val = this.getRatio(state, action.payload.attrName, action.payload.attrValue);
                if (val) {
                    this.updateRatio(
                        state,
                        action.payload.attrName,
                        action.payload.attrValue,
                        Kontext.updateFormValue(val, {isInvalid: action.payload.isInvalid})
                    );
                }
            }
        );

        this.addActionHandler<Actions.SubmitTask>(
            ActionName.SubmitTask,
            (state, action) => {
                state.isBusy = true;
                state.numOfErrors = 0;
            },
            (state, action, dispatch) => {
                this.submitTask(state).subscribe(
                    (data) => {
                        if (!data.attrs || !data.ids) {
                            const [msgType, msgText] = data.messages[0] || ['error', 'global__unknown_error'];
                            this.pluginApi.showMessage(msgType, this.pluginApi.translate(msgText));
                            const err = new Error(msgText);
                            dispatch<Actions.SubmitTaskDone>({
                                name: ActionName.SubmitTaskDone,
                                error: err
                            });
                            this.pluginApi.showMessage('error', err);

                        } else {
                            dispatch<Actions.SubmitTaskDone>({
                                name: ActionName.SubmitTaskDone,
                                payload: {
                                    result: {
                                        attrs: this.importResults(state.shares, state.ratioLimit, data.attrs),
                                        total: data.total,
                                        ids: Array<string>(data.ids),
                                        structs: Array<string>(data.structs)
                                    }
                                }
                            });
                        }
                    },
                    (err) => {
                        this.pluginApi.showMessage('error', err);
                        dispatch<Actions.SubmitTaskDone>({
                            name: ActionName.SubmitTaskDone,
                            error: err
                        });
                    }
                );
            }
        );

        this.addActionHandler<Actions.SubmitTaskDone>(
            ActionName.SubmitTaskDone,
            (state, action) => {
                state.isBusy = false;
                if (!action.error) {
                    state.currentResult = action.payload.result;
                    if (state.currentResult) {
                        state.numOfErrors = List.foldl(
                            (prev, curr) => prev + (!curr[2] ? 1 : 0), 0,
                            state.currentResult.attrs
                        );
                    }
                }
            }
        );

        this.addActionHandler<Actions.SubmitCreateSubcorpus>(
            ActionName.SubmitCreateSubcorpus,
            (state, action) => {
                state.isBusy = true;
            },
            (state, action, dispatch) => {
                this.submitCreateSubcorpus(state).subscribe(
                    (resp) => {
                        window.location.href = this.pluginApi.createActionUrl('subcorpus/subcorp_list');
                        dispatch<Actions.CreateSubcorpusDone>({
                            name: ActionName.CreateSubcorpusDone
                        });
                    },
                    (err) => {
                        this.pluginApi.showMessage('error', err);
                        dispatch<Actions.CreateSubcorpusDone>({
                            name: ActionName.CreateSubcorpusDone,
                            error: err
                        });
                    }
                );
            }
        );

        this.addActionHandler<Actions.CreateSubcorpusDone>(
            ActionName.CreateSubcorpusDone,
            null,
            (state, action, dispatch) => {
                state.isBusy = false;
                if (!action.error) {
                    // we leave the app here
                    window.location.href = this.pluginApi.createActionUrl('subcorpus/subcorp_list');
                }
            }
        );
    }

    /**
     * Parse attr value expression strings like
     * "doc_txtype == 'LEI: journalism'"
     * into elements: ['doc.txtype', 'LEI: journalism']
     *
     */
    private parseServerExpression(ex:string):[string, string] {
        const srch = /^([\w_]+)\s+==\s+'([^']+)'/.exec(ex);
        if (srch) {
            return [srch[1].replace('_', '.'), srch[2]];
        }
        return [null, null];
    }

    private importResults(shares:Array<SubcMixerExpression>,
            sizeErrorRatio:number, data:Array<[string, number]>):Array<[string, number, boolean]> {
        const evalDist = (v, idx) => {
            const userRatio = parseFloat(shares[idx].ratio.value) / 100;
            return Math.abs(v - userRatio) < sizeErrorRatio;
        };
        // We must first merge the tree-copied conditions back to
        // single ones. Here we assume that the conditions are split
        // in a way ensuring the sum of ratios for each key is actually 100%.
        let tmp:Array<[string, number]> = [];
        data.forEach(([key, value]) => {
            const srchIdx = List.findIndex(([v,]) => v === key, tmp);
            if (srchIdx > -1) {
                tmp[srchIdx] = tuple(key, tmp[srchIdx][1] + value);

            } else {
                tmp.push(tuple(key, value));
            }
        });

        const mappedData:Array<[string, number, boolean]> = pipe(
            tmp,
            List.map((item:[string, number]) => {
                const ans = this.parseServerExpression(item[0]);
                return {
                    data: item,
                    sharesIdx: shares.findIndex(x => x.attrName === ans[0] && x.attrValue === ans[1] && !x.zeroFixed)
                };
            }),
            List.filter(x => x.sharesIdx > - 1 && !shares[x.sharesIdx].zeroFixed),
            List.map((item, _) => tuple(
                item.data[0],
                item.data[1] * 100,
                evalDist(item.data[1], item.sharesIdx)
            ))
        );
        return mappedData;
    }

    private submitCreateSubcorpus(state:SubcMixerModelState):Observable<Kontext.AjaxResponse & {status: boolean}> {
        const err = validateSubcProps(
            state.currentSubcname,
            state.subcDescription,
            true,
            state.ttAttributes.some(item => item.hasUserChanges()),
            this.pluginApi
        );

        if (err) {
            return rxThrowError(err);
        }
        const args = {};
        args['corpname'] = this.pluginApi.getCorpusIdent().id;
        args['subcname'] = state.currentSubcname.value;
        args['publish'] = state.subcIsPublic ? '1' : '0';
        args['description'] = state.subcDescription.value;
        args['idAttr'] = state.corpusIdAttr;
        args['ids'] = state.currentResult.ids.join(',');
        args['structs'] = state.currentResult.structs.join(',');
        return this.pluginApi.ajax$<Kontext.AjaxResponse & {status: boolean}>(
            HTTP.Method.POST,
            this.pluginApi.createActionUrl('subcorpus/subcmixer_create_subcorpus'),
            args
        );
    }

    private submitTask(state:SubcMixerModelState):Observable<any> {
        const sums = {};
        state.shares.forEach(item => {
            if (!sums.hasOwnProperty(item.attrName)) {
                sums[item.attrName] = 0;
            }
            sums[item.attrName] += parseFloat(item.ratio.value || '0');
        });
        for (let k in sums) {
            if (sums[k] !== 100) {
                return rxThrowError(new Error(this.pluginApi.translate(
                    'ucnk_subcm__ratios_cannot_over_100_{struct_name}{over_val}',
                    {struct_name: k, over_val: this.pluginApi.formatNumber(sums[k] - 100)})));
            }
        }
        const args = {};
        args['corpname'] = this.pluginApi.getCorpusIdent().id;
        args['aligned_corpora'] = state.alignedCorpora;
        args['expression'] = JSON.stringify(
            state.shares.map(item => ({
                attrName: item.attrName,
                attrValue: item.attrValue,
                ratio: item.ratio ? parseFloat(item.ratio.value) : null
            }))
        );
        return this.pluginApi.ajax$<CalculationResponse>(
            HTTP.Method.POST,
            this.pluginApi.createActionUrl('subcorpus/subcmixer_run_calc'),
            args
        );
    }

    private getTtAttribute(state:SubcMixerModelState, ident:string):TextTypes.AttributeSelection {
        return state.ttAttributes.find((val) => val.name === ident);
    }

    private getAvailableValues(state:SubcMixerModelState):Array<TextTypeAttrVal> {

        const getInitialAvailableValues = (attrName:string):Array<TextTypes.AttributeValue> => {
            const idx = List.findIndex(
                item => item.name === attrName,
                state.ttInitialAvailableValues
            );
            return idx > -1 ?
                List.map(item => item, state.ttInitialAvailableValues[idx].getValues()) :
                [];
        };

        return pipe(
            state.ttAttributes,
            List.filter(item => item.hasUserChanges()),
            List.flatMap(item => {
                const tmp = pipe(
                    this.getTtAttribute(state, item.name).getValues(),
                    List.filter(item => item.selected),
                    List.map(item => item.value)
                );
                return List.map(
                    subItem => ({
                        attrName: item.name,
                        attrValue: subItem.value,
                        isSelected: List.some(x => x === subItem.value, tmp)
                    }),
                    getInitialAvailableValues(item.name)
                );
            })
        );
    }

    private validateRatio(ratio:string):Error|null {
        if (/^(\d*\.\d+|\d+)$/.exec(ratio)) {
            return null;
        }
        return new Error(this.pluginApi.translate('ucnk_subcm__invalid_value'));
    }

    private getRatio(state:SubcMixerModelState, attrName:string, attrValue:string):Kontext.FormValue<string>|undefined {
        const srch = state.shares.find(item => item.attrName === attrName && item.attrValue === attrValue && item.zeroFixed === false);
        return srch ? srch.ratio : undefined;
    }

    private updateRatio(state:SubcMixerModelState, attrName:string, attrValue:string, ratio:Kontext.FormValue<string>):void {
        const idx = state.shares.findIndex(item => item.attrName === attrName
                && item.attrValue === attrValue && item.zeroFixed === false);
        if (idx > -1) {
            const curr = state.shares[idx];
            state.shares[idx] = {
                ...curr,
                ratio: ratio
            };
        }
    }

    getShares(state:SubcMixerModelState):Array<SubcMixerExpression> {
        return state.shares.filter(item => item.zeroFixed === false);
    }

    /**
     * Return the total number of tokens in
     * texts matching all the attribute values
     * belonging to the provided attrName.
     *
     * Please note that individual sizes
     * (and thus the total size) may change
     * during the existence of the object
     * (e.g. by interactive text type selection).
     */
    getTtAttrSize(state:SubcMixerModelState, attrName:string):number {
        const item = state.ttAttributes.find(item => item.name === attrName);
        if (item) {
            return item.getValues().reduce((prev, curr) => prev + curr.availItems, 0);
        }
        return -1;
    }

    /**
     * Avoids splitting to problematic values like 1/3, 1/6 etc.
     * by modifying the last element.
     */
    safeCalcInitialRatio(numItems:number, currIdx:number):number {
        const r = Math.round(100 / numItems * 10) / 10;
        return currIdx < numItems - 1 ? r : 100 - (numItems - 1) * r;
    }

    private refreshData(state:SubcMixerModelState):void {
        const availableValues = this.getAvailableValues(state);
        const numValsPerGroup = pipe(
            availableValues,
            List.filter(item => item.isSelected),
            List.foldl(
                (prev, curr) => {
                    if (!Dict.hasKey(curr.attrName, prev)) {
                        prev[curr.attrName] = 0;
                    }
                    prev[curr.attrName] += 1;
                    return prev;
                },
                {} as {[key:string]:number}
            )
        );
        state.shares = pipe(
            availableValues,
            List.filter(item => item.isSelected),
            List.map((item, i) => {
                const attrVal = state.ttAttributes
                        .find(val => val.name === item.attrName)
                        .getValues()
                        .find(item2 => item2.value == item.attrValue);
                const total = this.getTtAttrSize(state, item.attrName);
                return {
                    ...item,
                    ratio: Kontext.newFormValue(
                        item.isSelected ? this.safeCalcInitialRatio(numValsPerGroup[item.attrName], i).toFixed(1) : '0',
                        true
                    ),
                    baseRatio: attrVal ? (attrVal.availItems / total * 100).toFixed(1) : '?',
                    zeroFixed: !item.isSelected
                };
            })
        );
    }
}
