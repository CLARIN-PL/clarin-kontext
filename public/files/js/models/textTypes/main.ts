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

import { Action, IFullActionControl, StatefulModel } from 'kombo';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as Immutable from 'immutable';

import { TextTypes } from '../../types/common';
import { AjaxResponse } from '../../types/ajaxResponses';
import { IPluginApi } from '../../types/plugins';
import * as rangeSelector from './rangeSelector';
import { TextInputAttributeSelection, FullAttributeSelection } from './valueSelections';
import { List } from 'cnc-tskit';


/**
 * Server-side data representing a single text types box (= a single [struct].[attr])
 * as returned by respective AJAX calls.
 */
export interface BlockLine {


    Values?:Array<{v:string; xcnt?:number}>;

    /**
     * Specifies a size (approx. in chars) of a text input
     * box required for this specific BlockLine. This is
     * Bonito-open approach but KonText still uses sthe
     * value to distinguish between enumerated items
     * and input-text ones.
     *
     * Please note that 'Values' and 'textboxlength' are
     * mutually exclusive.
     */
    textboxlength?:number;

    attr_doc:string;

    attr_doc_label:string;

    is_interval:number;

    label:string;

    name:string;

    numeric:boolean;
}

/**
 * Server-side data
 */
export interface Block {
    Line:Array<BlockLine>;
}


export interface SelectionFilterValue {

    ident:string;

    v:string;

    lock:boolean;

    /*
     * Specifies how many items in returned list is actually behind the item.
     * This typically happens in case there are multiple items with the same name.
     */
    numGrouped:number;

    availItems?:number;
}


export type SelectionFilterMap = {[k:string]:Array<SelectionFilterValue>};


/**
 * Server-side data representing a group
 * of structures, structural attributes and
 * their values.
 *
 * Please note that for bib_attr, the initial
 * data is not expected to contain items IDs
 * which means that bibliography attribute box
 * model must be always an instance of
 * ./valueSelections.TextInputAttributeSelection
 * (otherwise a user would click on a label but
 * there would be no corresponding ID underneath)
 * On server, this is ensured by passing the
 * bib. attr. name to 'shrink_list' argument
 * (see lib/texttypes.py method export_with_norms())
 */
export interface InitialData {
    Blocks:Array<Block>;
    Normslist:Array<any>;
    bib_attr:string; // bib item label (possibly non-unique)
    id_attr:string; // actual bib item identifier (unique)
}


export interface SelectedTextTypes {
    [key:string]:Array<string>;
}


const typeIsSelected = (data:SelectedTextTypes, attr:string, v:string):boolean => {
    if (data.hasOwnProperty(attr)) {
        return data[attr].indexOf(v) > -1;
    }
    return false;
}

function importInitialData(data:InitialData,
        selectedItems:SelectedTextTypes):Array<TextTypes.AttributeSelection> {
    const mergedBlocks:Array<BlockLine> = List.foldl(
        (prev, curr) => prev.concat(curr.Line),
        [] as Array<BlockLine>,
        data.Blocks
    );
    if (mergedBlocks.length > 0) {
        return mergedBlocks.map((attrItem:BlockLine) => {
            if (attrItem.textboxlength) {
                // TODO restore selected items also here (must load labels first...)
                return new TextInputAttributeSelection(
                    attrItem.name,
                    attrItem.label,
                    attrItem.numeric,
                    !!attrItem.is_interval,
                    {
                        doc: attrItem.attr_doc,
                        docLabel: attrItem.attr_doc_label
                    },
                    '',
                    Immutable.List([]), Immutable.List([]));

            } else {
                const values:Array<TextTypes.AttributeValue> = attrItem.Values.map(
                    (valItem:{v:string, xcnt:number}) => {
                        return {
                            value: valItem.v,
                            ident: valItem.v, // TODO what about bib items?
                            selected: typeIsSelected(selectedItems, attrItem.name, valItem.v) ?
                                true : false,
                            locked:false,
                            availItems:valItem.xcnt,
                            // TODO here we expect that initial data
                            // do not have any name duplicities
                            numGrouped: 1
                        };
                    }
                );
                return new FullAttributeSelection(
                    attrItem.name,
                    attrItem.label,
                    attrItem.numeric,
                    !!attrItem.is_interval,
                    {
                        doc: attrItem.attr_doc,
                        docLabel: attrItem.attr_doc_label
                    },
                    Immutable.List(values)
                );
            }
        });
    }
    return null;
}


export interface TextTypesModelState {

    attributes:Immutable.List<TextTypes.AttributeSelection>;

    /**
     * A text type attribute which serves as a title (possibly non-unique)
     * of a bibliography item. The value can be undefined.
     */
    bibLabelAttr:string;

    /**
     * A text type attribute which is able to uniquely determine a single document.
     * The value can be undefined (in such case we presume there are no bibliography
     * items present)
     */
    bibIdAttr:string;

    /**
     * A list of selection snapshots generated by calling
     * the snapshotState() method. At least one item
     * (initial state) is always present.
     */
    selectionHistory:Immutable.List<Immutable.List<TextTypes.AttributeSelection>>;

    /**
     * Select-all request flags
     */
    selectAll:Immutable.Map<string, boolean>;

    /**
     * Represents meta information related to the whole attribute
     * (i.e. not just to a single value).
     */
    metaInfo:Immutable.Map<string, TextTypes.AttrSummary>;

    minimizedBoxes:Immutable.Map<string, boolean>;

    textInputPlaceholder:string;

    isBusy:boolean;

    autoCompleteSupport:boolean;

    hasSelectedItems:boolean;
}


/**
 * Provides essential general operations on available text types
 * (filtering values, updating status - checked/locked, ...).
 *
 * All the state data is based on Immutable.js except for individual data
 * items which are updated via manual copying (i.e. no Immutable.Record).
 */
export class TextTypesModel extends StatefulModel<TextTypesModelState>
    implements TextTypes.ITextTypesModel, TextTypes.IAdHocSubcorpusDetector {

    private readonly pluginApi:IPluginApi;

    /**
     * A helper class used to process range-like selection requests
     * (e.g. "select years between 1980 and 1990").
     */
    private readonly rangeSelector:rangeSelector.RangeSelector;

    private readonly notifySelectionChange:()=>void; // TODO this is an ungly antipattern;


    constructor(dispatcher:IFullActionControl, pluginApi:IPluginApi, data:InitialData,
            selectedItems?:SelectedTextTypes) {
        const attributes = importInitialData(data, selectedItems || {});
        super(
            dispatcher,
            {
                attributes: Immutable.List(attributes),
                bibLabelAttr: data.bib_attr,
                bibIdAttr: data.id_attr,
                selectionHistory: Immutable.List<Immutable.List<TextTypes.AttributeSelection>>().push(
                    Immutable.List(attributes)),
                selectAll: Immutable.Map<string, boolean>(
                    attributes.map(
                        (item:TextTypes.AttributeSelection)=>[item.name, false]
                    )
                ),
                metaInfo: Immutable.Map<string, TextTypes.AttrSummary>(),
                textInputPlaceholder: null,
                isBusy: false,
                minimizedBoxes: Immutable.Map<string, boolean>(
                    attributes.map(v => [v.name, false])),
                // the autocomplete is enabled by outside conditions (e.g. liveattrs plug-in
                // is enabled) so it must be turned on via enableAutoCompleteSupport() by the
                // user of this model.
                autoCompleteSupport: false,
                hasSelectedItems: false
            }
        );
        this.pluginApi = pluginApi;
        this.rangeSelector = new rangeSelector.RangeSelector(pluginApi, this);
        this.notifySelectionChange = ():void => {
            dispatcher.dispatch({
                name: 'TT_SELECTION_CHANGED',
                payload: {
                    attributes: this.getAttributes(),
                    hasSelectedItems: this.findHasSelectedItems()
                }
            });
        }
    }

    onAction(action:Action) {
        switch (action.name) {
            case 'TT_VALUE_CHECKBOX_CLICKED':
                this.changeValueSelection(action.payload['attrName'], action.payload['itemIdx']);
                this.notifySelectionChange();
                break;
            case 'TT_SELECT_ALL_CHECKBOX_CLICKED':
                this.applySelectAll(action.payload['attrName']);
                this.notifySelectionChange();
            case 'TT_RANGE_BUTTON_CLICKED':
                this.applyRange(action.payload['attrName'], action.payload['fromVal'],
                        action.payload['toVal'], action.payload['strictInterval'],
                        action.payload['keepCurrent']);
                this.notifySelectionChange();
                break;
            case 'TT_TOGGLE_RANGE_MODE':
                this.setRangeMode(
                    action.payload['attrName'],
                    !this.getRangeModes().get(action.payload['attrName'])
                );
                this.emitChange();
                break;
            case 'TT_EXTENDED_INFORMATION_REQUEST':
                this.state.isBusy = true;
                const attr = this.getAttribute(action.payload['attrName']);
                const ident = action.payload['ident'];
                const attrIdx = this.state.attributes.indexOf(attr);
                const srchIdx = attr.getValues().findIndex(v => v.ident === ident);
                if (srchIdx > - 1 && attr.getValues().get(srchIdx).numGrouped < 2) {
                    this.state.attributes = this.state.attributes.set(
                        attrIdx,
                        attr.mapValues(item => {
                            return {
                                availItems: item.availItems,
                                extendedInfo: undefined,
                                ident: item.ident,
                                locked: item.locked,
                                numGrouped: item.numGrouped,
                                selected: item.selected,
                                value: item.value
                            };
                    }));
                    this.emitChange();

                } else if (srchIdx > -1) {
                    const message = this.pluginApi.translate(
                        'query__tt_multiple_items_same_name_{num_items}',
                        {num_items: attr.getValues().get(srchIdx).numGrouped}
                    );
                    this.setExtendedInfo(attr.name, ident, Immutable.Map({__message__: message}));
                    this.emitChange();
                }
                break;
            break;
            case 'TT_EXTENDED_INFORMATION_REQUEST_DONE':
                this.state.isBusy = false;
                this.setExtendedInfo(
                    action.payload['attrName'],
                    action.payload['ident'],
                    Immutable.OrderedMap<string, string|number>(action.payload['data'])
                );
                this.emitChange();
            break;
            case 'TT_EXTENDED_INFORMATION_REMOVE_REQUEST':
                this.clearExtendedInfo(action.payload['attrName'], action.payload['ident']);
                this.emitChange();
                break;
            case 'TT_ATTRIBUTE_AUTO_COMPLETE_HINT_CLICKED':
                this.setTextInputAttrValue(action.payload['attrName'], action.payload['ident'],
                        action.payload['label'], action.payload['append']);
                this.emitChange();
                this.notifySelectionChange();
                break;
            case 'TT_ATTRIBUTE_TEXT_INPUT_CHANGED':
                this.handleAttrTextInputChange(action.payload['attrName'], action.payload['value']);
                this.emitChange();
                break;
            case 'TT_ATTRIBUTE_AUTO_COMPLETE_RESET':
                this.resetAutoComplete(action.payload['attrName']);
                this.emitChange();
                break;
            case 'TT_ATTRIBUTE_TEXT_INPUT_AUTOCOMPLETE_REQUEST':
                this.state.isBusy = true;
                this.emitChange();
                break;
            case 'TT_ATTRIBUTE_TEXT_INPUT_AUTOCOMPLETE_REQUEST_DONE':
                this.state.isBusy = false;
                this.setAutoComplete(
                    action.payload['attrName'],
                    action.payload['data']
                );
                this.emitChange();
            break;
            case 'TT_MINIMIZE_ALL':
                this.state.minimizedBoxes = this.state.minimizedBoxes.map((v, k) => true).toMap();
                this.emitChange();
            break;
            case 'TT_MAXIMIZE_ALL':
                this.state.minimizedBoxes = this.state.minimizedBoxes.map((v, k) => false).toMap();
                this.emitChange();
            break;
            case 'TT_TOGGLE_MINIMIZE_ITEM':
                this.state.minimizedBoxes = this.state.minimizedBoxes.set(
                    action.payload['ident'],
                    !this.state.minimizedBoxes.get(action.payload['ident'])
                );
                this.emitChange();
            break;
            case 'TT_SNAPSHOT_STATE':
                this.state.selectionHistory = this.state.selectionHistory.push(
                    this.state.attributes);
                this.emitChange();
            break;
            case 'TT_UNDO_STATE':
                this.state.selectionHistory = this.state.selectionHistory.pop();
                this.state.attributes = this.state.selectionHistory.last();
                this.emitChange();
                this.notifySelectionChange();
            break;
            case 'TT_RESET_STATE':
                this.reset();
                this.emitChange();
                this.notifySelectionChange();
            break;
            case 'TT_LOCK_SELECTED':
                this.getAttributesWithSelectedItems(false).forEach((attrName:string) => {
                    this.mapItems(attrName, (item:TextTypes.AttributeValue) => ({
                        ident: item.ident,
                        value: item.value,
                        selected: item.selected,
                        locked: true,
                        availItems: item.availItems,
                        numGrouped: item.numGrouped,
                        extendedInfo: item.extendedInfo
                    }));
                });
                this.emitChange();
            break;
            case 'TT_FILTER_WHOLE_SELECTION':
                this.filterWholeSelection(action.payload['data']);
                this.emitChange();
            break;
            case 'TT_SET_ATTR_SUMMARY':
                this.state.metaInfo = this.state.metaInfo.set(
                    action.payload['attrName'], action.payload['value']);
                this.emitChange();
            break;
        }
    }

    unregister():void {}

    enableAutoCompleteSupport():void {
        this.state.autoCompleteSupport = true;
    }

    applyCheckedItems(checkedItems:TextTypes.ServerCheckedValues,
            bibMapping:TextTypes.BibMapping):void {
        Object.keys(checkedItems).forEach(k => {
            const attrIdx = this.state.attributes.findIndex(
                v => k === this.state.bibIdAttr ?
                    v.name === this.state.bibLabelAttr : v.name === k);
            if (attrIdx === -1) {
                console.warn(`Cannot apply checked value for ${k}`);
                return;
            }
            let attr = this.state.attributes.get(attrIdx);
            // now we must distinguish 4 cases:
            // [structattr box is configured as bibliography list] x
            // [structattr box is a list of items or a text input box]
            if (attr.name === this.state.bibLabelAttr) {
                if (attr instanceof TextInputAttributeSelection) {
                    checkedItems[k].forEach(checkedVal => {
                        attr = (<TextInputAttributeSelection>attr).addValue({
                            ident: checkedVal,
                            value: checkedVal in bibMapping ? bibMapping[checkedVal] : checkedVal,
                            selected: true,
                            locked: false,
                            numGrouped: 0
                        });
                    });
                    this.state.attributes = this.state.attributes.set(attrIdx, attr);

                } else {
                    this.state.attributes = this.state.attributes.set(
                        attrIdx,
                        attr.mapValues(item => {
                            return {
                                ident: item.ident,
                                value: item.ident in bibMapping ?
                                    bibMapping[item.ident] : item.value,
                                selected: checkedItems[k].indexOf(item.value) > -1 ? true : false,
                                locked: false,
                                availItems: item.availItems,
                                numGrouped: item.numGrouped,
                                extendedInfo: item.extendedInfo
                            }
                        })
                    );
                }

            } else {
                if (attr instanceof TextInputAttributeSelection) {
                    checkedItems[k].forEach(checkedVal => {
                        attr = (<TextInputAttributeSelection>attr).addValue({
                            ident: checkedVal,
                            value: checkedVal,
                            selected: true,
                            locked: false,
                            numGrouped: 0
                        });
                    });
                    this.state.attributes = this.state.attributes.set(attrIdx, attr);

                } else {
                    this.state.attributes = this.state.attributes.set(
                        attrIdx, attr.mapValues(item => {
                        return {
                            ident: item.ident,
                            value: item.value,
                            selected: checkedItems[k].indexOf(item.value) > -1 ? true : false,
                            locked: false,
                            availItems: item.availItems,
                            numGrouped: item.numGrouped,
                            extendedInfo: item.extendedInfo
                        }
                    }));
                }
            }
        });
    }


    private clearExtendedInfo(attrName:string, ident:string):void {
        const attr = this.getAttribute(attrName);
        if (attr) {
            const attrIdx = this.state.attributes.indexOf(attr);
            const newAttr = attr.setExtendedInfo(ident, null);
            this.state.attributes = this.state.attributes.set(attrIdx, newAttr);

        } else {
            throw new Error('Attribute not found: ' + attrName);
        }
    }

    private resetAutoComplete(attrName:string):void {
        const attr = this.getTextInputAttribute(attrName);
        if (attr) {
            const idx = this.state.attributes.indexOf(attr);
            this.state.attributes = this.state.attributes.set(idx, attr.resetAutoComplete());
        }
    }

    private handleAttrTextInputChange(attrName:string, value:string) {
        const attr = this.getTextInputAttribute(attrName);
        if (attr) {
            const idx = this.state.attributes.indexOf(attr);
            this.state.attributes = this.state.attributes.set(idx, attr.setTextFieldValue(value));
        }
    }

    private setTextInputAttrValue(attrName:string, ident:string, label:string,
            append:boolean):void {
        const attr:TextTypes.AttributeSelection = this.getTextInputAttribute(attrName);
        const idx = this.state.attributes.indexOf(attr);
        const newVal:TextTypes.AttributeValue = {
            ident,
            value: label,
            selected: true,
            locked: false,
            numGrouped: 1
        };
        const updatedAttr = append ? attr.addValue(newVal) : attr.clearValues().addValue(newVal);
        this.state.attributes = this.state.attributes.set(idx, updatedAttr);
    }

    syncFrom(src:Observable<AjaxResponse.QueryFormArgs>):Observable<AjaxResponse.QueryFormArgs> {
        return src.pipe(
            tap(
                (data) => {
                    this.applyCheckedItems(data.selected_text_types, data.bib_mapping);
                }
            )
        );
    }

    private changeValueSelection(attrIdent:string, itemIdx:number):void {
        const attr = this.getAttribute(attrIdent);
        const idx = this.state.attributes.indexOf(attr);
        if (attr) {
            this.state.attributes = this.state.attributes.set(
                idx, attr.toggleValueSelection(itemIdx));

        } else {
            throw new Error('no such attribute value: ' + attrIdent);
        }
        this.state.hasSelectedItems = this.findHasSelectedItems();
        this.emitChange();
    }

    // TODO move notify... out of the method
    private applyRange(attrName:string, fromVal:number, toVal: number, strictInterval:boolean,
            keepCurrent:boolean):void {
        this.rangeSelector
            .applyRange(attrName, fromVal, toVal, strictInterval, keepCurrent)
            .subscribe(
                (newSelection:TextTypes.AttributeSelection) => {
                    this.emitChange();
                },
                (err) => {
                    this.pluginApi.showMessage('error', err);
                }
            );
    }

    private applySelectAll(ident:string) {
        const item = this.getAttribute(ident);
        const idx = this.state.attributes.indexOf(item);
        if (item.containsFullList()) {
            this.state.selectAll = this.state.selectAll.set(ident,
                !this.state.selectAll.get(ident));
            const newVal = this.state.selectAll.get(ident);
            this.state.attributes = this.state.attributes.set(idx, item.mapValues((item) => {
                return {
                    ident: item.ident,
                    value: item.value,
                    selected: newVal,
                    locked: item.locked,
                    numGrouped: item.numGrouped,
                    availItems: item.availItems
                };
            }));
            this.state.hasSelectedItems = this.findHasSelectedItems();
            this.emitChange();
        }
    }

    canUndoState():boolean {
        return this.state.selectionHistory.size > 1;
    }

    private reset():void {
        this.state.attributes = this.state.selectionHistory.first();
        this.state.selectionHistory = this.state.selectionHistory.slice(0, 1).toList();
        this.state.selectAll = this.state.selectAll.map((item)=>false).toMap();
        this.state.metaInfo = this.state.metaInfo.clear();
        this.state.hasSelectedItems = false;
    }

    getAttribute(ident:string):TextTypes.AttributeSelection {
        return this.state.attributes.find((val) => val.name === ident);
    }

    getTextInputAttribute(ident:string):TextTypes.ITextInputAttributeSelection {
        const ans = this.state.attributes.find(val => val.name === ident);
        if (ans instanceof TextInputAttributeSelection) {
            return ans;
        }
        return undefined;
    }

    replaceAttribute(ident:string, val:TextTypes.AttributeSelection):void {
        const attr = this.getAttribute(ident);
        const idx = this.state.attributes.indexOf(attr);
        if (idx > -1) {
            this.state.attributes = this.state.attributes.set(idx, val);

        } else {
            throw new Error('Failed to find attribute ' + ident);
        }
    }

    getAttributes():Immutable.List<TextTypes.AttributeSelection> {
        return this.state.attributes;
    }

    getInitialAvailableValues():Immutable.List<TextTypes.AttributeSelection> {
        return this.state.selectionHistory.get(0);
    }

    /**
     * @deprecated use actions along with model.suspend()
     */
    exportSelections(lockedOnesOnly:boolean):{[attr:string]:Array<string>} {
        const ans = {};
        this.state.attributes.forEach((attrSel:TextTypes.AttributeSelection) => {
            if (attrSel.hasUserChanges()) {
                if (this.state.autoCompleteSupport) {
                    ans[attrSel.name !== this.state.bibLabelAttr ?
                        attrSel.name :
                        this.state.bibIdAttr] = attrSel.exportSelections(lockedOnesOnly);

                } else {
                    if (attrSel instanceof TextInputAttributeSelection) {
                        ans[attrSel.name] = [attrSel.getTextFieldValue()];

                    } else {
                        ans[attrSel.name] = attrSel.exportSelections(lockedOnesOnly);
                    }
                }
            }
        });
        return ans;
    }

    private filterWholeSelection(filterData:SelectionFilterMap) {
        let k; // must be defined here (ES5 cannot handle for(let k...) here)
        for (k in filterData) {
            this.updateItems(k, filterData[k].map(v => v.ident));
            this.mapItems(k, (v, i) => {
                if (filterData[k][i]) {
                    return {
                        ident: filterData[k][i].ident,
                        value: filterData[k][i].v,
                        selected: v.selected,
                        locked: v.locked,
                        numGrouped: filterData[k][i].numGrouped,
                        availItems: filterData[k][i].availItems,
                        extendedInfo: v.extendedInfo
                    };

                } else {
                    return null;
                }
            });
            this.filter(k, (item) => item !== null);
        }
    }

    private updateItems(attrName:string, items:Array<string>):void {
        const attr = this.getAttribute(attrName);
        const idx = this.state.attributes.indexOf(attr);
        if (idx > -1) {
            this.state.attributes = this.state.attributes.set(idx, attr.updateItems(items));
        }
    }

    filter(attrName:string, fn:(v:TextTypes.AttributeValue)=>boolean):void {
        const attr = this.getAttribute(attrName);
        const idx = this.state.attributes.indexOf(attr);
        if (idx > -1) {
            this.state.attributes = this.state.attributes.set(idx, attr.filter(fn));
        }
    }

    mapItems(attrName:string, mapFn:(v:TextTypes.AttributeValue,
            i?:number)=>TextTypes.AttributeValue):void {
        const attr = this.getAttribute(attrName);
        const idx = this.state.attributes.indexOf(attr);
        if (idx > -1) {
            const newAttr = attr.mapValues(mapFn);
            this.state.attributes = this.state.attributes.set(idx, newAttr);
        }
    }

    setValues(attrName:string, values:Array<string>):void {
        const attr = this.getAttribute(attrName);
        const idx = this.state.attributes.indexOf(attr);
        const values2:Array<TextTypes.AttributeValue> = values.map((item:string) => {
            return {
                ident: item, // TODO what about bib items?
                value: item,
                selected: false,
                locked: false,
                numGrouped: 1 // TODO is it always OK here?
            };
        });
        if (idx > -1) {
            this.state.attributes = this.state.attributes.set(idx, attr.setValues(values2));

        } else {
            throw new Error('Failed to find attribute ' + attrName);
        }
    }

    /**
     * This applies only for TextInputAttributeSelection boxes. In other
     * cases the function has no effect.
     */
    setAutoComplete(attrName:string, values:Array<TextTypes.AutoCompleteItem>):void {
        const attr = this.getTextInputAttribute(attrName);
        if (attr) {
            let idx = this.state.attributes.indexOf(attr);
            this.state.attributes = this.state.attributes.set(idx, attr.setAutoComplete(values));
        }
    }

    findHasSelectedItems(attrName?:string):boolean {
        if (attrName !== undefined) {
            const attr = this.state.attributes.find((val) => val.name === attrName);
            if (attr) {
                return attr.hasUserChanges();

            } else {
                throw new Error('Failed to find attribute ' + attrName);
            }

        } else {
            return this.getAttributes().some(item => item.hasUserChanges());
        }
    }

    usesAdHocSubcorpus():boolean {
        return this.findHasSelectedItems();
    }

    getAttributesWithSelectedItems(includeLocked:boolean):Array<string> {
        return this.state.attributes.filter((item:TextTypes.AttributeSelection) => {
            return item.hasUserChanges() && (!item.isLocked() || includeLocked);
        }).map((item:TextTypes.AttributeSelection)=>item.name).toArray();
    }

    getAttrSummary():Immutable.Map<string, TextTypes.AttrSummary> {
        return this.state.metaInfo;
    }

    setExtendedInfo(attrName:string, ident:string, data:Immutable.Map<string, string|number>):void {
        let attr = this.getAttribute(attrName);
        if (attrName) {
            let attrIdx = this.state.attributes.indexOf(attr);
            this.state.attributes = this.state.attributes.set(attrIdx,
                attr.setExtendedInfo(ident, data));

        } else {
            throw new Error('Failed to find attribute ' + attrName);
        }
    }

    setTextInputPlaceholder(s:string):void {
        this.state.textInputPlaceholder = s;
    }

    getTextInputPlaceholder():string {
        return this.state.textInputPlaceholder;
    }

    setRangeMode(attrName:string, rangeIsOn:boolean) {
        this.rangeSelector.setRangeMode(attrName, rangeIsOn);
    }

    getRangeModes():Immutable.Map<string, boolean> {
        return this.rangeSelector.getRangeModes();
    }

    isBusy():boolean {
        return this.state.isBusy;
    }

    getMiminimizedBoxes():Immutable.Map<string, boolean> {
        return this.state.minimizedBoxes;
    }

    hasSomeMaximizedBoxes():boolean {
        return this.state.minimizedBoxes.find(v => v === false) !== undefined;
    }

    getBibIdAttr():string {
        return this.state.bibIdAttr;
    }

    getBibLabelAttr():string {
        return this.state.bibLabelAttr;
    }
}