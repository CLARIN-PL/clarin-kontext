/*
 * Copyright (c) 2022 Charles University in Prague, Faculty of Arts,
 *                    Institute of the Czech National Corpus
 * Copyright (c) 2022 Martin Zimandl <martin.zimandl@gmail.com>
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

import * as React from 'react';
import * as Kontext from '../../../types/kontext';
import { Bound, IActionDispatcher } from "kombo";
import { FreqChartsAvailableData, FreqChartsAvailableTypes, FreqChartsModel, FreqChartsModelState } from "../../../models/freqs/regular/freqCharts";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, ResponsiveContainer } from 'recharts';
import { Dict, List, pipe } from 'cnc-tskit';
import { Actions } from '../../../models/freqs/regular/actions';
import * as theme from '../../theme/default';
import { ResultBlock } from '../../../models/freqs/regular/common';


export function init(
    dispatcher:IActionDispatcher,
    he:Kontext.ComponentHelpers,
    freqChartsModel:FreqChartsModel,
) {

    // ----------------------- <FreqCharts /> -------------------------

    interface FreqChartsProps {
        sourceId:string;
        data:ResultBlock;
        type:FreqChartsAvailableTypes;
        dataKey:FreqChartsAvailableData;
        fmaxitems:number;
        sortColumn:string;
        isBusy:boolean;
    }

    const FreqChart:React.FC<FreqChartsProps> = (props) => {

        const handleOrderChange = (e) => {
            dispatcher.dispatch<typeof Actions.FreqChartsChangeOrder>({
                name: Actions.FreqChartsChangeOrder.name,
                payload: {
                    value: e.target.value,
                    sourceId: props.sourceId
                }
            });
        }

        const handleUnitsChange = (e) => {
            dispatcher.dispatch<typeof Actions.FreqChartsChangeUnits>({
                name: Actions.FreqChartsChangeUnits.name,
                payload: {
                    value: e.target.value,
                    sourceId: props.sourceId
                }
            });
        }

        const handleTypeChange = (e) => {
            dispatcher.dispatch<typeof Actions.FreqChartsChangeType>({
                name: Actions.FreqChartsChangeType.name,
                payload: {
                    value: e.target.value,
                    sourceId: props.sourceId
                }
            });
        }

        const handlePageSizeChange = (e) => {
            dispatcher.dispatch<typeof Actions.FreqChartsChangePageSize>({
                name: Actions.FreqChartsChangePageSize.name,
                payload: {
                    value: e.target.value,
                    sourceId: props.sourceId
                }
            });
        }

        const maxLabelLength = (List.maxItem(
            v => v.length,
            props.data.Items.map(v => v.Word[0])
        ) as string).length

        return <div>
            <fieldset>
                <label htmlFor='sel-type'>type:</label>
                <select id='sel-type' value={props.type} onChange={handleTypeChange}>
                    <option value='bar'>bar</option>
                    <option value='timeline'>timeline</option>
                </select>
                <label htmlFor='sel-units'>units:</label>
                <select id='sel-units' value={props.dataKey} onChange={handleUnitsChange}>
                    <option value='freq'>abs</option>
                    {List.some(v => !!v.rel, props.data.Items) ?
                        <option value='rel'>ipm</option> :
                        null
                    }
                </select>
                <label htmlFor='input-max'>display max:</label>
                <input type='number' min={1} id='input-max' value={props.fmaxitems} onChange={handlePageSizeChange} />
                {props.type !== 'timeline' ?
                    <>
                        <label htmlFor='sel-order'>order:</label>
                        <select id='sel-order' value={props.sortColumn} onChange={handleOrderChange}>
                            <option value='0'>name</option>
                            <option value='freq'>freq</option>
                            {List.some(v => !!v.rel, props.data.Items) ?
                                <option value='rel'>rel</option> :
                                null
                            }
                        </select>
                    </> :
                    null}
                {props.isBusy ?
                    <img src={he.createStaticUrl('img/ajax-loader-bar.gif')}alt={he.translate('global__loading')} /> :
                    null}
            </fieldset>
            {props.type[props.sourceId] === 'bar' ?
                <ResponsiveContainer width="95%" height={List.size(props.data.Items) * 17 + 60}>
                    <BarChart data={props.data.Items} layout='vertical'>
                        <CartesianGrid strokeDasharray='3 3'/>
                        <XAxis type='number' height={50} label={props.dataKey} />
                        <YAxis type="category" interval={0} dataKey={v => v.Word[0]} width={Math.max(60, maxLabelLength * 7)}/>
                        <Tooltip />
                        <Bar dataKey={props.dataKey[props.sourceId]} barSize={15} fill={theme.colorLogoBlue} />
                    </BarChart>
                </ResponsiveContainer> :
                <ResponsiveContainer width="95%" height={300}>
                    <LineChart data={props.data.Items}>
                        <CartesianGrid strokeDasharray='3 3'/>
                        <XAxis type='category' height={50} dataKey={v => v.Word[0]} />
                        <YAxis type='number' />
                        <Tooltip />
                        <Line dataKey={props.dataKey} />
                    </LineChart>
                </ResponsiveContainer>
            }
        </div>;
    };


    const FreqChartsView:React.FC<FreqChartsModelState> = (props) => (
        <div>
            {pipe(
                props.data,
                Dict.toEntries(),
                List.map(
                    ([sourceId, block]) => (
                        block ?
                            <FreqChart sourceId={sourceId} data={block}
                                    dataKey={props.dataKey[sourceId]}
                                    fmaxitems={props.fmaxitems[sourceId]}
                                    sortColumn={props.sortColumn[sourceId]}
                                    type={props.type[sourceId]}
                                    isBusy={props.isBusy} /> :
                            <div>TODO loading...</div>
                    )
                )
            )}
        </div>
    );

    return {
        FreqChartsView: Bound(FreqChartsView, freqChartsModel)
    };
}