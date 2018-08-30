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

import * as React from 'react';
import * as Immutable from 'immutable';
import {ActionDispatcher} from '../../app/dispatcher';
import {Kontext} from '../../types/common';
import {PublicSubcorpListState, PublicSubcorpListModel,
    CorpusItem, DataItem, Actions} from '../../models/subcorp/listPublic';

export interface Views {
    List:React.ComponentClass<ListProps, PublicSubcorpListState>;
}

export interface ListProps {

}

export function init(dispatcher:ActionDispatcher, he:Kontext.ComponentHelpers,
        model:PublicSubcorpListModel) {

    const layoutViews = he.getLayoutViews();

    // -------------------------- <CorpusSelect /> -------------------

    const CorpusSelect:React.SFC<{
        corpora:Immutable.List<CorpusItem>;
        value:string;

    }> = (props) => {

        const handleChange = (evt:React.ChangeEvent<HTMLSelectElement>) => {
            dispatcher.dispatch({
                actionType: Actions.SET_CORPUS_NAME,
                props: {
                    value: evt.target.value
                }
            });
        };

        return <select value={props.value} onChange={handleChange}>
            <option>---</option>
            {props.corpora.map(item =>
                <option key={item.ident} value={item.ident}>{item.label}</option>)
            }
        </select>;
    };

    // -------------------------- <CodePrefixInput /> ----------------

    const CodePrefixInput:React.SFC<{
        value:string;

    }> = (props) => {

        const handleChange = (evt:React.ChangeEvent<HTMLInputElement>) => {
            dispatcher.dispatch({
                actionType: Actions.SET_CODE_PREFIX,
                props: {
                    value: evt.target.value
                }
            });
        };

        return <input type="text" value={props.value} onChange={handleChange} />;
    }

    // -------------------------- <Filter /> -------------------------

    const Filter:React.SFC<{
        corpora:Immutable.List<CorpusItem>;
        currCorpus:string;
        codePrefix:string;

    }> = (props) => {
        return <fieldset>
            <label>
                {he.translate('pubsubclist__corpus')}:{'\u00a0'}
                <CorpusSelect corpora={props.corpora} value={props.currCorpus} />
            </label>

            <label>
                {he.translate('pubsubclist__enter_code_prefix')}:{'\u00a0'}
                <CodePrefixInput value={props.codePrefix} />
            </label>
        </fieldset>;
    };

    // -------------------------- <DetailExpandSwitch /> -----------------------

    const DetailExpandSwitch:React.SFC<{
        expanded:boolean;
        onClick:()=>void;

    }> = (props) => {
        return (
            <a className="DetailExpandSwitch" onClick={props.onClick}
                        title={he.translate('pubsubclist__view_detail')}>
                {props.expanded ?
                    <>
                        <layoutViews.ImgWithMouseover
                            src={he.createStaticUrl('img/sort_desc.svg')}
                            alt={he.translate('global__click_to_expand')} />
                            {he.translate('pubsubclist__view_detail')}:
                    </> :
                    <>
                        <layoutViews.ImgWithMouseover
                            src={he.createStaticUrl('img/next-page.svg')}
                            alt={he.translate('global__click_to_hide')} />
                        {he.translate('pubsubclist__view_detail')}{'\u2026'}
                    </>
                }
            </a>
        );
    };


    // -------------------------- <DataRow /> -------------------------

    class DataRow extends React.Component<{item:DataItem}, {expanded:boolean}> {

        constructor(props) {
            super(props);
            this.state = {expanded: false};
            this._handleExpandAction = this._handleExpandAction.bind(this);
        }

        private _handleExpandAction():void {
            this.setState({expanded: !this.state.expanded});
        }

        render() {
            return <li className="DataRow">
                <h3>{`${this.props.item.corpname} / ${this.props.item.origName}`}</h3>
                <DetailExpandSwitch expanded={this.state.expanded}
                    onClick={this._handleExpandAction} />
                {this.state.expanded ?
                        <div className="description">
                            <p>({this.props.item.ident})</p>
                            <div dangerouslySetInnerHTML={{__html: this.props.item.description}} />
                        </div> :
                    null
                }
            </li>;
        }
    };

    // -------------------------- <DataTable /> -------------------------

    const DataList:React.SFC<{
        data:Immutable.List<DataItem>

    }> = (props) => {
        return (
            <ul className="DataList">
                {props.data.map(item => <DataRow key={item.ident} item={item} />)}
            </ul>
        );
    };

    // -------------------------- <List /> -------------------------

    class List extends React.Component<ListProps, PublicSubcorpListState> {

        constructor(props) {
            super(props);
            this._modelChangeHandler = this._modelChangeHandler.bind(this);
            this.state = model.getState();
        }

        _modelChangeHandler(state:PublicSubcorpListState):void {
            this.setState(state);
        }

        componentDidMount():void {
            model.addChangeListener(this._modelChangeHandler);
        }

        componentWillUnmount():void {
            model.removeChangeListener(this._modelChangeHandler);
        }

        render() {
            return (
                <div className="List">
                    <form>
                        <Filter
                            corpora={this.state.corpora}
                            currCorpus={this.state.corpname}
                            codePrefix={this.state.codePrefix} />
                    </form>
                    <DataList data={this.state.data} />
                </div>
            );
        }
    }

    return {
        List: List
    };

}