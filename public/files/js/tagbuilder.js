/*
 * Copyright (c) 2012 Institute of the Czech National Corpus
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

/**
 * This library provides a clickable 'tag generator' widget.
 */
define(['jquery', 'multiselect', 'simplemodal', 'bonito', 'win'], function ($, multiselect, simpleModalNone, bonito, win) {
    'use strict';

    var lib = {},
        objectIsEmpty,
        resetButtonClickFunc,
        backButtonClickFunc;

    /**
     *
     * @param obj
     * @return {Boolean}
     */
    objectIsEmpty = function (obj) {
        var prop;
        for (prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                return false;
            }
        }
        return true;
    };

    /**
     *
     */
    resetButtonClickFunc = function (tagLoader) {
        return function () {
            tagLoader.resetWidget();
        };
    };

    /**
     *
     */
    backButtonClickFunc = function (tagLoader) {
        return function () {
            var prevSelection,
                prevActiveBlock,
                updateActiveBlock;

            updateActiveBlock = function (blockId, prevSelects) {
                if (tagLoader.multiSelectComponent.activeBlockId === blockId) {
                    $(tagLoader.multiSelectComponent.blocks[blockId]).find('input[type="checkbox"]').each(function () {
                        if (prevSelects.hasOwnProperty(blockId)) {
                            $(this).attr('checked', ($.inArray($(this).attr('value'), prevSelects[blockId]) === -1));

                        }
                        $(this).attr('disabled', false);
                    });
                    if (tagLoader.multiSelectComponent.getNumSelected(blockId) === 0) {
                        $(tagLoader.multiSelectComponent.blockSwitchLinks[blockId]).css('font-weight', 'normal');
                    }
                    $(tagLoader.hiddenElm).attr('value', tagLoader.formStatusToPlainText('.'));
                    $(tagLoader.tagDisplay).empty().append(tagLoader.formStatusToHTML());
                    tagLoader.updateBacklinks();
                }
            };

            tagLoader.history.pop(); // remove current status which has been already pushed
            tagLoader.activeBlockHistory.pop();
            prevSelection = tagLoader.history.pop(); // and use the previous one
            prevActiveBlock = tagLoader.activeBlockHistory.pop();

            if (!objectIsEmpty(prevSelection)) {
                tagLoader.loadPatternVariants(tagLoader.formStatusToPlainText('-'), function (data) {
                    tagLoader.updateMultiSelectValues(data, prevSelection, updateActiveBlock);
                    tagLoader.multiSelectComponent.activeBlockId = prevActiveBlock;
                });

            } else { // empty => load initial values
                prevSelection = {};
                prevSelection[tagLoader.multiSelectComponent.activeBlockId] = [];
                tagLoader.loadInitialVariants(function (data) {
                    tagLoader.updateMultiSelectValues(data, prevSelection, updateActiveBlock);
                    tagLoader.multiSelectComponent.activeBlockId = prevActiveBlock;
                    tagLoader.multiSelectComponent.collapseAll();
                });
            }
        };
    };

    /**
     *
     * @param {string} corpusName
     * @param {number} numTagPos
     * @param {MultiSelect} multiSelectComponent
     * @param {HTMLElement} hiddenElm
     * @constructor
     */
    function TagLoader(corpusName, numTagPos, multiSelectComponent, hiddenElm, tagDisplay) {

        /**
         * Holds a corpus name for which this object is configured.
         */
        this.corpusName = corpusName;

        /**
         *
         */
        this.numTagPos = numTagPos;

        /**
         *
         */
        this.hiddenElm = hiddenElm;

        /**
         *
         */
        this.multiSelectComponent = multiSelectComponent;

        /**
         *
         */
        this.tagDisplay = tagDisplay || null;

        /**
         * Latest tag pattern (e.g. PKM-4--2--------) used by this loader
         */
        this.lastPattern = '';

        /**
         * Initial values for all tag positions used by this tag loader (always the same for a specific corpus)
         */
        this.initialValues = null;

        /**
         *
         */
        this.selectedValues = [];

        /**
         * List of patterns user gradually created
         */
        this.history = [];

        /**
         *
         */
        this.activeBlockHistory = [];

    }

    /**
     * Encodes form status into a list of regular expressions (one for each position)
     */
    TagLoader.prototype.encodeFormStatusItems = function () {
        var data,
            ans = [],
            prop,
            positionCode,
            i;

        data = data || this.multiSelectComponent.exportStatus();
        for (prop in data) {
            if (data.hasOwnProperty(prop)) {
                positionCode = [];
                if (data.hasOwnProperty(prop)) {
                    for (i = 0; i < data[prop].length; i += 1) {
                        if (data[prop][i] !== null) {
                            positionCode.push(data[prop][i]);
                        }
                    }
                }
                if (positionCode.length > 1) {
                    ans.push('[' + positionCode.join('') + ']');

                } else if (positionCode.length === 1) {
                    ans.push(positionCode[0]);

                } else {
                    ans.push('-');
                }
            }
        }
        return ans;
    };

    /**
     *
     * @return {*}
     */
    TagLoader.prototype.getLatestActiveBlock = function () {
        if (this.activeBlockHistory.length > 0) {
            return this.activeBlockHistory[this.activeBlockHistory.length - 1];
        }
        return null;
    };

    /**
     * Encodes multi-select element-based form into a tag string (like 'NNT1h22' etc.)
     *
     * @param anyCharSymbol
     */
    TagLoader.prototype.formStatusToPlainText = function (anyCharSymbol) {
        var ans,
            items;

        items = this.encodeFormStatusItems();
        anyCharSymbol = anyCharSymbol || '-';
        ans = items.join('');

        if (anyCharSymbol !== '-') {
            ans = ans.replace(/-/g, anyCharSymbol);
        }
        if (anyCharSymbol === '.') {
            ans = ans.replace(/([^.]?)(\.)+$/, '$1.*');
        }
        if (ans.length === 0) {
            ans = '.*';
        }
        return ans;
    };

    /**
     *
     * @return {String}
     */
    TagLoader.prototype.formStatusToHTML = function () {
        var ans = '',
            items,
            i,
            lastNonDotPos;

        items = this.encodeFormStatusItems();
        lastNonDotPos = items.length - 1;
        while (lastNonDotPos >= 0 && items[lastNonDotPos] === '-') {
            lastNonDotPos -= 1;
        }

        for (i = 0; i <= lastNonDotPos; i += 1) {
            if (items[i] === '-') {
                ans += '<span class="backlink" data-block-idx="' + i + '">' + items[i].replace('-', '.') + '</span>';

            } else {
                ans += '<a class="backlink" data-block-idx="' + i + '">' + items[i] + '</a>';
            }
        }
        if (lastNonDotPos === items.length - 2) {
            ans += '.';

        } else if (lastNonDotPos < items.length - 2) {
            ans += '.*';
        }
        return ans;
    };

    /**
     *
     */
    TagLoader.prototype.updateBacklinks = function () {
        var self = this;

        $(this.tagDisplay).find('a.backlink').each(function () {
            $(this).bind('click', function () {
                var liElms = $(self.multiSelectComponent.ulElement).find('li:nth-child('
                    + (parseInt($(this).data('block-idx'), 10) + 1) + ')');
                if (liElms.length === 1) {
                    self.multiSelectComponent.flipBlockVisibility($(liElms[0]).data('block-id'));
                }
            });
        });
    };

    /**
     * Updates all SELECT element-based form items with provided data
     *
     * @param data data to be used to update form (array (each SELECT one item) of arrays (each OPTION one possible
     * tag position value) of arrays (0 - value, 1 - label))
     * @param {Object} [selects]
     * @param {function} [callback] called with parameters blockId and prevSelects (see the function inside)
     */
    TagLoader.prototype.updateMultiSelectValues = function (data, selects, callback) {
        var getResponseLength,
            prevSelects = selects || this.multiSelectComponent.exportStatus(),
            blockSwitchEventHandlers,
            lockPreviousItems,
            itemClickCallback,
            self = this;

        getResponseLength = function (resp) {
            var prop,
                ans = 0;

            if (resp.hasOwnProperty('length')) {
                return resp.length;
            }
            for (prop in resp) {
                if (resp.hasOwnProperty(prop)) {
                    ans += 1;
                }
            }
            return ans;
        };

        blockSwitchEventHandlers = {
            mouseover: function (event) {
                var blockId = $(event.target.parentNode).data('block-id'),
                    items;

                items = $(self.tagDisplay).find('*');
                if (items.get(self.multiSelectComponent.getBlockOrder(blockId)) !== undefined) {
                    $(items.get(self.multiSelectComponent.getBlockOrder(blockId))).attr('class', 'backlink called');
                }
            },
            mouseout: function (event) {
                var blockId = $(event.target.parentNode).data('block-id'),
                    items;

                items = $(self.tagDisplay).find('*');
                if (items.get(self.multiSelectComponent.getBlockOrder(blockId)) !== undefined) {
                    $(items.get(self.multiSelectComponent.getBlockOrder(blockId))).attr('class', 'backlink');
                }
            }
        };

        lockPreviousItems = function (data) {
            self.updateMultiSelectValues(data, null, function (blockId) {
                if (self.multiSelectComponent.getNumSelected(blockId) > 0
                        && self.multiSelectComponent.activeBlockId !== blockId) {
                    $(self.multiSelectComponent.blockSwitchLinks[blockId]).css('opacity', 0.4);
                    $(self.multiSelectComponent.blocks[blockId]).find('input[type="checkbox"]')
                        .attr('disabled', 'disabled');
                }
            });
        };

        itemClickCallback = function () {
            var pattern = self.formStatusToPlainText();
            self.loadPatternVariants(pattern, lockPreviousItems);
            $(self.hiddenElm).attr('value', self.formStatusToPlainText('.'));
            $(self.tagDisplay).empty().append(self.formStatusToHTML());
            self.updateBacklinks();

        };

        if (prevSelects && !objectIsEmpty(prevSelects)) {
            this.history.push(prevSelects);

            if (this.getLatestActiveBlock() === this.multiSelectComponent.activeBlockId
                    && this.multiSelectComponent.activeBlockId) {
                if (this.multiSelectComponent.getNumSelected(this.multiSelectComponent.activeBlockId) === 0) {
                    this.activeBlockHistory.pop();
                    this.history.pop();
                }

            } else {
                this.activeBlockHistory.push(this.multiSelectComponent.activeBlockId);
            }
        }

        (function (self) {
            var i,
                j,
                blockId,
                blockLabel,
                blockLength;

            for (i = 0; i < getResponseLength(data.tags); i += 1) {
                blockId = 'position_' + i;
                if ($.inArray(blockId, self.activeBlockHistory) === -1) {

                    if (!self.multiSelectComponent.containsBlock(blockId)) {
                        if (data.labels[i] !== undefined && data.labels[i] !== null) {
                            blockLabel = (i + 1) + ' - ' + data.labels[i];
                        } else {
                            blockLabel = (i + 1);
                        }
                        self.multiSelectComponent.addBlock(blockId, blockLabel, null, blockSwitchEventHandlers);

                    } else {
                        self.multiSelectComponent.clearBlock(blockId);
                    }
                    if (data.tags[i].length > 0) {
                        blockLength = data.tags[i].length;
                        for (j = 0; j < data.tags[i].length; j += 1) {
                            if (data.tags[i][j][0] !== '-') {
                                self.multiSelectComponent.addItem(blockId, data.tags[i][j][0], data.tags[i][j][1], itemClickCallback);
                                if (prevSelects.hasOwnProperty(blockId) && $.inArray(data.tags[i][j][0], prevSelects[blockId]) > -1) {
                                    self.multiSelectComponent.checkItem(blockId, data.tags[i][j][0]);

                                } else {
                                    self.multiSelectComponent.uncheckItem(blockId, data.tags[i][j][0]);
                                }

                            } else {
                                blockLength -= 1;
                                self.multiSelectComponent.setDefaultValue(blockId, data.tags[i][j][0]);
                            }
                        }
                        self.multiSelectComponent.updateBlockStatusText(blockId, '[ ' + blockLength + ' ]');

                    } else {
                        self.multiSelectComponent.updateBlockStatusText(blockId, '[ 0 ]');
                    }
                }

                if (typeof callback === 'function') {
                    callback(blockId, prevSelects);
                }
            }
        }(this));
    };

    /**
     * @param {function} callback function to be called when variants are loaded, JSON data is passed as a parameter
     * @param {function} [errorCallback]
     */
    TagLoader.prototype.loadInitialVariants = function (callback, errorCallback) {
        var url = 'ajax_get_tag_variants?corpname=' + this.corpusName,
            params = {},
            self = this;

        errorCallback = errorCallback || function (err) {};

        if (this.initialValues === null) {
            $.ajax({
                url: url,
                data: params,
                method: 'get',
                dataType: 'json',
                // requestHeaders: {Accept: 'application/json'},
                success: function (data) {
                    if (data.hasOwnProperty('error')) {
                        $.modal.close();
                        errorCallback(data.error);

                    } else {
                        self.initialValues = data;
                        callback(self.initialValues);
                    }
                },
                error: function (data) {
                    $.modal.close();
                    errorCallback();
                }
            });

        } else {
            callback(this.initialValues);
        }
    };

    /**
     *
     * @param pattern
     * @param callback
     */
    TagLoader.prototype.loadPatternVariants = function (pattern, callback) {
        var url = 'ajax_get_tag_variants?corpname=' + this.corpusName + '&pattern=' + pattern,
            params = {};

        $.ajax({
            url: url,
            data: params,
            method: 'get',
            // requestHeaders: {Accept: 'application/json'},
            complete: function (data) {
                callback($.parseJSON(data.responseText));
            }
        });
    };

    /**
     *
     */
    TagLoader.prototype.resetWidget = function () {
        var prop,
            self = this;

        this.history = [];
        this.activeBlockHistory = [];
        this.multiSelectComponent.uncheckAll();
        this.multiSelectComponent.collapseAll();
        this.loadInitialVariants(function (data) {
            self.updateMultiSelectValues(data);
        });
        for (prop in this.multiSelectComponent.blockSwitchLinks) {
            if (this.multiSelectComponent.blockSwitchLinks.hasOwnProperty(prop)) {
                $(this.multiSelectComponent.blockSwitchLinks[prop]).css('opacity', 1);
            }
        }
        $(this.tagDisplay).empty().append('.*');
        $(this.hiddenElm).attr('value', this.formStatusToPlainText('.'));
    };

    /**
     *
     * @param callback
     */
    TagLoader.prototype.initSelectedValues = function (callback) {
        var i;

        for (i = 0; i < this.numTagPos; i += 1) {
            callback(this.selectedValues, i);
        }
    };

    // attach TagLoader to the library
    lib.TagLoader = TagLoader;


    /**
     * A helper method that does whole 'create a tag loader for me' job.
     *
     * @param corpusName identifier of a corpus to be used along with this tag loader
     * @param numOfPos number of positions in the tag string
     * @param multiSelectComponent
     * @param opt a dictionary with following keys:
     *     resetButton    : ID or element itself for the "reset" button
     *     backButton     : ID or element itself for the "back" button
     *     tagDisplay     : ID or element itself for the "tag display" box
     *     hiddenElm      : ID or element itself
     *     errorCallback  : function to be called in case of an error
     * @return {TagLoader}
     */
    lib.attachTagLoader = function (corpusName, numOfPos, multiSelectComponent, opt) {
        var tagLoader,
            hiddenElm,
            tagDisplay,
            updateConcordanceQuery;

        if (typeof (opt.tagDisplay) === 'string') {
            opt.tagDisplay = $(opt.tagDisplay);
        }

        updateConcordanceQuery = function () {
            var pattern = tagLoader.formStatusToPlainText('.');
            if (opt.tagDisplay) {
                $(opt.tagDisplay).empty().append(pattern);
            }
            tagLoader.lastPattern = pattern;
            if (tagLoader.hiddenElm) {
                $(tagLoader.hiddenElm).val(pattern);
            }
        };

        hiddenElm = $(opt.hiddenElm).get(0);
        tagDisplay = $(opt.tagDisplay).get(0);

        tagLoader = new TagLoader(corpusName, numOfPos, multiSelectComponent, hiddenElm, tagDisplay);
        tagLoader.initSelectedValues(function (selectedValues, i) {
            selectedValues[i] = '-';
        });

        $(tagLoader.tagDisplay).attr('class', 'tag-display-box');
        $(tagLoader.tagDisplay).empty().append('.*');

        tagLoader.loadInitialVariants(function (data) {
            tagLoader.updateMultiSelectValues(data);
        });
        if (typeof (opt.resetButton) === 'string') {
            opt.resetButton = $(opt.resetButton);
        }
        if (opt.resetButton) {
            $(opt.resetButton).bind('click', resetButtonClickFunc(tagLoader));
        }
        if (typeof (opt.backButton) === 'string') {
            opt.backButton = $(opt.backButton);
        }
        if (opt.backButton) {
            $(opt.backButton).bind('click', backButtonClickFunc(tagLoader));
        }

        if (typeof opt.errorCallback === 'function') {
            tagLoader.errorCallback = opt.errorCallback;
        }

        updateConcordanceQuery();
        return tagLoader;
    };

    /**
     *
     * @param opt {Object} an object containing keys:
     *     inputElement - text input element to be enriched by this function
     *     widgetElement - wrapper element for whole widget
     *     modalWindowElement - modal box element (where widgetElement is inserted)
     *     insertTagButtonElement - button to insert tag string into the inputElement
     *     tagDisplayElement - element where tag value is written
     *     resetButtonElement - element representing the RESET function
     *     activateLink
     * @param multiSelectOpts {Object}
     * @param corpusName {string}
     * @param numTagPos {Number}
     * @param {function} errorCallback
     */
    lib.bindTextInputHelper = function (corpusName, numTagPos, opt, multiSelectOpts, errorCallback) {
        var prop;

        for (prop in opt) {
            if (opt.hasOwnProperty(prop)
                    && prop.indexOf('Element') + 'Element'.length === prop.length
                    && typeof opt[prop] === 'string'
                    && opt[prop].indexOf('#') !== 0) {
                opt[prop] = '#' + opt[prop];
            }
        }
        $(opt.inputElement).parent().find('.insert-tag a').bind('click', function () {
            var caretPos = bonito.getCaretPosition($(opt.inputElement)),
                insertTagClickAction,
                buttonEnterAction;

            insertTagClickAction = function () {
                var bef, aft;

                if ($(opt.inputElement).val()) {
                    bef = $(opt.inputElement).val().substring(0, caretPos);
                    aft = $(opt.inputElement).val().substring(caretPos);
                    $(opt.inputElement).val(bef + 'tag="' + $(opt.tagDisplayElement).text() + '"' + aft);

                } else {
                    $(opt.inputElement).val('[tag="' + $(opt.tagDisplayElement).text() + '"]');
                }
                $.modal.close();
                $(win.document).off('keypress', buttonEnterAction);
                $(opt.inputElement).focus();
            };

            buttonEnterAction = function (event) {
                if (event.which === 13) {
                    insertTagClickAction(event);
                }
            };

            $(opt.modalWindowElement).modal({
                onShow : function () {
                    var msComponent = multiselect.createMultiselectComponent(opt.widgetElement, multiSelectOpts);

                    lib.attachTagLoader(corpusName, numTagPos, msComponent, {
                        tagDisplay : $(opt.tagDisplayElement),
                        resetButton : $(opt.resetButtonElement),
                        errorCallback : errorCallback
                    });

                    $(opt.insertTagButtonElement).one('click', insertTagClickAction);
                    $(win.document).on('keypress', buttonEnterAction);
                },
                onClose : function () {
                    $(win.document).off('keypress', buttonEnterAction);
                    $.modal.close();
                    $(opt.inputElement).focus();
                }
            });
        });
    };

    return lib;
});