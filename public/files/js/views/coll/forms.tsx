/*
 * Copyright (c) 2016 Charles University in Prague, Faculty of Arts,
 *                    Institute of the Czech National Corpus
 * Copyright (c) 2016 Tomas Machalek <tomas.machalek@gmail.com>
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
import * as Immutable from 'immutable';
import {ActionDispatcher} from '../../app/dispatcher';
import {Kontext} from '../../types/common';
import {CollFormModel, CollFormModelState} from '../../models/coll/collForm';


export interface CollFormProps {

}


export interface FormsViews {
    CollForm:React.ComponentClass<CollFormProps>;
}


export function init(dispatcher:ActionDispatcher, he:Kontext.ComponentHelpers, collFormModel:CollFormModel):FormsViews {

    const layoutViews = he.getLayoutViews();

    // -------------------- <AttrSelection /> --------------------------------------------

    const AttrSelection:React.SFC<{
        cattr:string;
        attrList:Immutable.List<Kontext.AttrItem>;

    }> = (props) => {

        const handleSelection = (evt) => {
            dispatcher.dispatch({
                actionType: 'COLL_FORM_SET_CATTR',
                props: {
                    value: evt.target.value
                }
            });
        };

        return (
            <select onChange={handleSelection} value={props.cattr}>
                {props.attrList.map(item => {
                    return <option key={item.n} value={item.n}>{item.label}</option>
                })}
            </select>
        );
    };

    // -------------------- <WindowSpanInput /> --------------------------------------------

    const WindowSpanInput:React.SFC<{
        cfromw:Kontext.FormValue<string>;
        ctow:Kontext.FormValue<string>;

    }> = (props) => {

        const handleFromValChange = (evt) => {
            dispatcher.dispatch({
                actionType: 'COLL_FORM_SET_CFROMW',
                props: {
                    value: evt.target.value
                }
            });
        };

        const handleToValChange = (evt) => {
            dispatcher.dispatch({
                actionType: 'COLL_FORM_SET_CTOW',
                props: {
                    value: evt.target.value
                }
            });
        };

        return (
            <div>
                <layoutViews.ValidatedItem invalid={props.cfromw.isInvalid}>
                    <input type="text" style={{width: '3em'}} value={props.cfromw.value}
                            onChange={handleFromValChange} />
                </layoutViews.ValidatedItem>
                {'\u00a0'}{he.translate('coll__to')}{'\u00a0'}
                <layoutViews.ValidatedItem invalid={props.ctow.isInvalid}>
                    <input type="text" style={{width: '3em'}} value={props.ctow.value}
                            onChange={handleToValChange} />
                </layoutViews.ValidatedItem>
            </div>
        );
    };

    // -------------------- <MinCollFreqCorpInput /> --------------------------------------------

    const MinCollFreqCorpInput:React.SFC<{
        cminfreq:Kontext.FormValue<string>;

    }> = (props) => {

        const handleInputChange = (evt) => {
            dispatcher.dispatch({
                actionType: 'COLL_FORM_SET_CMINFREQ',
                props: {
                    value: evt.target.value
                }
            });
        };

        return (
            <layoutViews.ValidatedItem invalid={props.cminfreq.isInvalid}>
                <input type="text" value={props.cminfreq.value} style={{width: '3em'}}
                        onChange={handleInputChange} />
            </layoutViews.ValidatedItem>
        );
    };

    // -------------------- <MinCollFreqSpanInput /> --------------------------------------------

    const MinCollFreqSpanInput:React.SFC<{
        cminbgr:Kontext.FormValue<string>;

    }> = (props) => {

        const handleInputChange = (evt) => {
            dispatcher.dispatch({
                actionType: 'COLL_FORM_SET_CMINBGR',
                props: {
                    value: evt.target.value
                }
            });
        };

        return (
            <layoutViews.ValidatedItem invalid={props.cminbgr.isInvalid}>
                <input type="text" value={props.cminbgr.value} style={{width: '3em'}}
                        onChange={handleInputChange} />
            </layoutViews.ValidatedItem>
        );

    };

    //

    const CollMetricsTermTh:React.SFC<{
        value:string;
        code:string;

    }> = (props) => {
        const term = he.getHelpLink('term_coll_' + props.code);
        return <th className="measure">
            {
                term ?
                <layoutViews.Abbreviation
                    value={props.value} url={term}
                    desc={he.translate(`coll__form_help_term_${props.code}`)} /> :
                props.value
            }
            </th>;
    }


    // -------------------- <CollMetricsSelection /> --------------------------------------------

    const CollMetricsSelection:React.SFC<{
        availCbgrfns:Immutable.OrderedMap<string, string>;
        cbgrfns:Immutable.Set<string>;
        csortfn:string;

    }> = (props) => {

        const handleDisplayCheckboxClick = (value) => (evt) => {
            dispatcher.dispatch({
                actionType: 'COLL_FORM_SET_CBGRFNS',
                props: {
                    value: value
                }
            });
            evt.stopPropagation();
        };

        const handleCheckboxClick = (value) => (evt) => {
            dispatcher.dispatch({
                actionType: 'COLL_FORM_SET_CSORTFN',
                props: {
                    value: value
                }
            });
            evt.stopPropagation();
        };

        return (
            <table className="CollMetricsSelection">
                <tbody>
                    <tr>
                        <td />
                        <th>
                            {he.translate('coll__show_measures_th')}
                        </th>
                        <th>
                            {he.translate('coll__sort_by_th')}
                        </th>
                    </tr>
                    {props.availCbgrfns.map((item, k) => {
                        return (
                            <tr key={`v_${k}`} className={props.cbgrfns.includes(k) ? 'selected' : null}>
                                <CollMetricsTermTh value={item} code={k} />
                                <td className="display-chk"
                                        onClick={handleDisplayCheckboxClick(k)}>
                                    <input type="checkbox" value={k}
                                            checked={props.cbgrfns.includes(k)}
                                            readOnly={true} />
                                </td>
                                <td className={props.csortfn === k ? 'sort-sel is-sort' : 'sort-sel'}
                                        onClick={handleCheckboxClick(k)}>
                                    <input type="radio" value={k}
                                            checked={props.csortfn === k}
                                            readOnly={true} />
                                </td>
                            </tr>
                        );
                    }).toList()}
                </tbody>
            </table>
        );
    };

    // -------------------- <CollocationsForm /> --------------------------------------------

    class CollForm extends React.Component<CollFormProps, CollFormModelState> {

        constructor(props) {
            super(props);
            this._modelChangeListener = this._modelChangeListener.bind(this);
            this._handleSubmitClick = this._handleSubmitClick.bind(this);
            this.state = collFormModel.getState();
        }

        _modelChangeListener(state:CollFormModelState) {
            this.setState(state);
        }

        _handleSubmitClick() {
            dispatcher.dispatch({
                actionType: 'COLL_FORM_SUBMIT',
                props: {}
            });
        }

        componentDidMount() {
            collFormModel.addChangeListener(this._modelChangeListener);
        }

        componentWillUnmount() {
            collFormModel.removeChangeListener(this._modelChangeListener);
        }

        render() {
            return (
                <form className="CollForm">
                    <table className="form">
                        <tbody>
                            <tr>
                                <th>{he.translate('coll__attribute_label')}:</th>
                                <td>
                                    <AttrSelection attrList={this.state.attrList} cattr={this.state.cattr} />
                                </td>
                            </tr>
                            <tr>
                                <th>{he.translate('coll__coll_window_span')}:</th>
                                <td>
                                    <WindowSpanInput
                                            cfromw={this.state.cfromw}
                                            ctow={this.state.ctow} />
                                </td>
                            </tr>
                            <tr>
                                <th>{he.translate('coll__min_coll_freq_in_corpus')}:</th>
                                <td>
                                    <MinCollFreqCorpInput cminfreq={this.state.cminfreq} />
                                </td>
                            </tr>
                            <tr>
                                <th>{he.translate('coll__min_coll_freq_in_span')}:</th>
                                <td>
                                    <MinCollFreqSpanInput cminbgr={this.state.cminbgr} />
                                </td>
                            </tr>
                            <tr>
                                <th>{he.translate('coll__measures_heading')}:</th>
                                <td />
                            </tr>
                            <tr>
                                <td colSpan={2}>
                                    <CollMetricsSelection cbgrfns={this.state.cbgrfns}
                                                availCbgrfns={this.state.availCbgrfns}
                                                csortfn={this.state.csortfn} />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="buttons">
                        <button type="button" className="default-button"
                                onClick={this._handleSubmitClick}>
                            {he.translate('coll__make_candidate_list')}
                        </button>
                    </div>
                </form>
            );
        }
    }

    return {
        CollForm: CollForm
    };

}