/*
 * Copyright (c) 2020 Charles University in Prague, Faculty of Arts,
 *                    Institute of the Czech National Corpus
 * Copyright (c) 2020 Tomas Machalek <tomas.machalek@gmail.com>
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

import { Action } from 'kombo';
import { Kontext } from '../../types/common';


export class Actions {

    static UserInfoRequested:Action<{
    }> = {
        name: 'USER_INFO_REQUESTED'
    };

    static UserInfoLoaded:Action<{
        data:Kontext.UserCredentials
    }> = {
        name: 'USER_INFO_LOADED'
    };

    static UserShowLoginDialog:Action<{
        returnUrl:string;
    }> = {
        name: 'USER_SHOW_LOGIN_DIALOG'
    };

    static UserHideLoginDialog:Action<{
    }> = {
        name: 'USER_HIDE_LOGIN_DIALOG'
    };

    static UserLogoutx:Action<{
    }> = {
        name: 'USER_LOGOUTX'
    };

}