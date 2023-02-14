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

import { IActionDispatcher } from 'kombo';
import * as React from 'react';
import { Actions as HelpActions } from '../../models/help/actions';
import { Actions } from '../../models/freqs/regular/actions';
import { ComponentHelpers } from '../../types/kontext';
import * as SChart from './charts/style';
import * as S from './style';


export interface CommonFreqComponents {
    ConfidenceIntervalHintBox:React.FC<{
        onCloseClick:()=>void;
        confIntervalLeftMinWarn:number;
    }>;
    FreqsHelp:React.FC<{
        confIntervalLeftMinWarn:number;
    }>;
    ShareLinkWidget:React.FC<{
        url:string;
        sourceId:string;
    }>;
}


export function init(dispatcher:IActionDispatcher, he:ComponentHelpers):CommonFreqComponents {

    const layoutViews = he.getLayoutViews();


    // ----------------------- <ConfidenceIntervalHint /> ------------------

    const ConfidenceIntervalHint:React.FC<{
        confIntervalLeftMinWarn: number;

    }> = ({confIntervalLeftMinWarn}) => (
        <SChart.ConfidenceIntervalHint>
            <p>
                {he.translate('freq__ct_confidence_level_hint_part1')}
            </p>
            {confIntervalLeftMinWarn ?
                <p>
                    {he.translate('freq__ct_confidence_level_hint_part2_{threshold}',
                        {threshold: confIntervalLeftMinWarn})}
                </p> :
                null
            }
            <h3>{he.translate('freq__ct_references')}:</h3>
            <ul className="references">
                <li>
                    Wallis, Sean 2012 - <a className="external" href="https://corplingstats.wordpress.com/2012/04/30/inferential-statistics/" target="_blank">Inferential statistics – and other animals</a>
                    <ul>
                        <li>
                            <a className="external" href="https://web.archive.org/web/20200928215512/https://corplingstats.wordpress.com/2012/04/30/inferential-statistics/" target="_blank">web.archive.org</a>
                        </li>
                    </ul>
                </li>
                <li>
                    <a className="external" href="https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval" target="_blank">Wilson score interval</a> (Wikipedia)
                </li>
                {he.getLocale() ==='cs_CZ' ?
                    <li>
                        <a className="external" target="_blank" href="https://wiki.korpus.cz/doku.php/pojmy:konfidencni_intervaly">Binomické konfidenční intervaly a jejich interpretace</a>
                        (wiki Českého národního korpusu)
                    </li> :
                    null
                }
            </ul>
        </SChart.ConfidenceIntervalHint>
    );

    // ----------------------- <ConfidenceIntervalHintBox /> --------------------

    const ConfidenceIntervalHintBox:CommonFreqComponents['ConfidenceIntervalHintBox'] =
    ({confIntervalLeftMinWarn, onCloseClick}) => (

        <layoutViews.PopupBox onCloseClick={onCloseClick} takeFocus={true} customClass="hint">
            <ConfidenceIntervalHint confIntervalLeftMinWarn={confIntervalLeftMinWarn} />
        </layoutViews.PopupBox>
    );


    // ------------------- <FreqsHelp /> -----------------------------

    const FreqsHelp:CommonFreqComponents['FreqsHelp'] = ({confIntervalLeftMinWarn}) => {

        const [visible, changeState] = React.useState(false);

        const toggleHelp = () => {
            if (!visible) {
                dispatcher.dispatch<typeof HelpActions.HelpRequested>({
                    name: HelpActions.HelpRequested.name,
                    payload: {
                        section: 'freqs'
                    }
                });
            };
            changeState(!visible);
        };

        return (
            <SChart.FreqsHelp className="topbar-help-icon">
                <a className="icon" onClick={toggleHelp}>
                    <layoutViews.ImgWithMouseover
                        htmlClass="over-img"
                        src={he.createStaticUrl('img/question-mark.svg')}
                        alt={he.translate('global__click_to_see_help')} />
                </a>
                {visible ?
                    <layoutViews.ModalOverlay onCloseKey={toggleHelp}>
                        <layoutViews.CloseableFrame onCloseClick={toggleHelp} label={he.translate('freq__main_help_box_hd')}>
                            <h2>{he.translate('freq__binom_conf_interval_hd')}</h2>
                            <ConfidenceIntervalHint confIntervalLeftMinWarn={confIntervalLeftMinWarn} />
                        </layoutViews.CloseableFrame>
                    </layoutViews.ModalOverlay> :
                    null
                }
            </SChart.FreqsHelp>
        );
    };


    // ----------------------- <ShareLinkWidget /> -------------------

    const ShareLinkWidget:React.FC<{
        url:string;
        sourceId:string;

    }> = (props) => {

        const [{recipient}, changeState] = React.useState({recipient: ''});

        const copyToClipboard = () => {
            dispatcher.dispatch(
                Actions.ResultLinkCopyToClipboard,
                {sourceId: props.sourceId}
            );
        };

        const shareViaEmail = () => {
            dispatcher.dispatch(
                Actions.ResultLinkShareViaEmail,
                {
                    sourceId: props.sourceId,
                    recipient,
                    url: props.url
                }
            );
        };

        const onMailInputChange = (evt:React.ChangeEvent<HTMLInputElement>) => {
            changeState({recipient: evt.target.value});
        };

        return (
            <S.ShareFreqTable>
                <h4>{he.translate('global__permanent_link')}</h4>
                <div className="link">
                    <input className="share-link" type="text" readOnly={true}
                        onClick={(e)=> (e.target as HTMLInputElement).select()}
                        value={props.url} />
                    <span>
                        <a onClick={copyToClipboard}>
                            <layoutViews.ImgWithMouseover
                                src={he.createStaticUrl('img/copy-icon.svg')}
                                src2={he.createStaticUrl('img/copy-icon_s.svg')}
                                alt={he.translate('global__copy_to_clipboard')}
                                style={{width: '1.5em'}} />
                        </a>
                    </span>
                </div>
                <h4>{he.translate('global__send_link_via_email')}</h4>
                <div className="mail">
                    <label>{he.translate('global__mail_recipient')}:{'\u00a0'}
                        <input
                            type="email"
                            value={recipient}
                            onChange={onMailInputChange}
                            style={{width: '20em'}} />
                    </label>
                    <a className="util-button" onClick={shareViaEmail}>
                        {he.translate('global__send')}
                    </a>
                </div>
            </S.ShareFreqTable>
        );
    }


    return {
        ConfidenceIntervalHintBox,
        FreqsHelp,
        ShareLinkWidget
    };
}