/*
 * Copyright (c) 2017 Charles University in Prague, Faculty of Arts,
 *                    Institute of the Czech National Corpus
 * Copyright (c) 2017 Tomas Machalek <tomas.machalek@gmail.com>
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

import RSVP from 'rsvp';
import {Kontext} from '../types/common';
import {PageModel} from '../app/main';
import issueReportingPlugin from 'plugins/issueReporting/init';
import {init as messageViewsInit, MessageViewProps} from '../views/message';
import { MessageModel } from '../models/common/layout';


declare var require:any;
// weback - ensure a style (even empty one) is created for the page
require('styles/message.less');

class MessagePage {

    private layoutModel:PageModel;

    constructor(layoutModel:PageModel) {
        this.layoutModel = layoutModel;
    }

    init():void {
        this.layoutModel.init().then(
            () => {
                if (this.layoutModel.pluginIsActive('issue_reporting')) {
                    return issueReportingPlugin(this.layoutModel.pluginApi());

                } else {
                    return null;
                }
            }
        ).then(
            (plugin) => {
                const views = messageViewsInit(
                    this.layoutModel.dispatcher,
                    this.layoutModel.getComponentHelpers(),
                    this.layoutModel.getMessageModel()
                );
                this.layoutModel.renderReactComponent<MessageViewProps>(
                    views.MessagePageHelp,
                    document.getElementById('root-mount'),
                    {
                        widgetProps: this.layoutModel.getConf<Kontext.GeneralProps>('issueReportingAction') || null,
                        anonymousUser: this.layoutModel.getConf<boolean>('anonymousUser'),
                        issueReportingView: plugin ? <React.SFC<{}>>plugin.getWidgetView() : null,
                        lastUsedCorpus: this.layoutModel.getConf<{corpname:string; human_corpname:string}>('LastUsedCorp')
                    }
                );

            }

        ).then(
            this.layoutModel.addUiTestingFlag

        ).catch(
            (err) => {
                console.error(err);
                this.layoutModel.showMessage('error', err);
            }
        );
    }
}


export function init(conf:Kontext.Conf):void {
    new MessagePage(new PageModel(conf)).init();
}