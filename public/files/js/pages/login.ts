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

import {Kontext} from '../types/common';
import {PageModel} from '../app/main';

declare var require:any;
// weback - ensure a style (even empty one) is created for the page
require('styles/login.less');

export function init(conf:Kontext.Conf):void {
    const layoutModel = new PageModel(conf);
    layoutModel.init().then(
        () => {
            document.getElementById('try-login').addEventListener('click', () => {
                layoutModel.dispatcher.dispatch({
                    actionType: 'USER_SHOW_LOGIN_DIALOG',
                    props: {
                        returnUrl: layoutModel.createActionUrl('first_form')
                    }
                });
            });
            document.getElementById('go-to-query').addEventListener('click', () => {
                window.location.href = layoutModel.createActionUrl('first_form');
            });
            layoutModel.addUiTestingFlag();
        }

    ).catch(
        (err) => {
            console.error(err);
        }
    );
}