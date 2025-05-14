// tablePushToChat.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import {parseSheetRender} from "./sheetCustomRenderer.js";
import {cellClickEditModeEvent, cellHighlight} from "../editor/chatSheetsDataView.js";
import {replaceUserTag } from "../../utils/stringUtil.js";

/**
 * 解析html，将其中代表表格单元格的\$\w\d+字符串替换为对应的表格单元格内容
 * 对于任意\$\w\d+字符串，其中\w为表格的列数，\d+为表格的行数，例如$B3表示表格第二列第三行的内容，行数从header行开始计数，header行为0
 * */
function parseTableRender(html, table) {
    return html;
}

async function renderEditableSheetsDOM(_sheets, _viewSheetsContainer) {
    for (let [index, sheet] of _sheets.entries()) {
        if(sheet.config.toChat === false) continue; // 如果不需要推送到聊天，则跳过
        if (sheet.config.useCustomStyle === true) {
            // 使用自定义样式
            const customStyle = parseSheetRender(sheet)
            const sheetContainer = document.createElement('div')
            sheetContainer.innerHTML = replaceUserTag(customStyle) //替换掉自定义样式中的<user>标签
            $(_viewSheetsContainer).append(sheetContainer)

        } else {
            // 使用默认样式
            const instance = new BASE.Sheet(sheet)
            const sheetContainer = document.createElement('div')
            const sheetTitleText = document.createElement('h3')
            sheetContainer.style.overflowX = 'none'
            sheetContainer.style.overflowY = 'auto'
            sheetTitleText.innerText = `#${index} ${sheet.name}`

            let sheetElement = null
            sheetElement = instance.renderSheet(cell => cell.element.style.cursor = 'default')
            cellHighlight(instance)
            $(sheetContainer).append(sheetElement)

            $(_viewSheetsContainer).append(sheetTitleText)
            $(_viewSheetsContainer).append(sheetContainer)
            $(_viewSheetsContainer).append(`<hr>`)
        }
    }
}

/**
 * 将table数据推送至聊天内容中显示
 * @param sheets
 */
function replaceTableToStatusTag(sheets) {
    let chatContainer
    if (USER.tableBaseSetting.table_to_chat_mode === 'context_bottom') {
        chatContainer = window.document.querySelector('#chat');
    } else if (USER.tableBaseSetting.table_to_chat_mode === 'last_message') {
        chatContainer = window.document.querySelector('.last_mes')?.querySelector('.mes_text'); // 获取最后一条消息的容器
    } else if (USER.tableBaseSetting.table_to_chat_mode === 'macro') {
        // 在document中查找到{{sheetsView}}的位置

    }

    // 定义具名的事件监听器函数
    const touchstartHandler = function(event) {
        event.stopPropagation();
    };
    const touchmoveHandler = function(event) {
        event.stopPropagation();
    };
    const touchendHandler = function(event) {
        event.stopPropagation();
    };

    setTimeout(async () => {
        // 此处注意竞态条件，可能在setTimeout执行前，上一轮tableStatusContainer还未被添加
        const currentTableStatusContainer = document.querySelector('#tableStatusContainer');
        if (currentTableStatusContainer) {
            // 移除之前的事件监听器，防止重复添加 (虽然在这个场景下不太可能重复添加)
            currentTableStatusContainer.removeEventListener('touchstart', touchstartHandler);
            currentTableStatusContainer.removeEventListener('touchmove', touchmoveHandler);
            currentTableStatusContainer.removeEventListener('touchend', touchendHandler);
            currentTableStatusContainer?.remove(); // 移除旧的 tableStatusContainer
        }

        // 在这里添加新的 tableStatusContainer
        const r = USER.tableBaseSetting.to_chat_container.replace(/\$0/g, `<tableStatus id="table_push_to_chat_sheets"></tableStatus>`);
        $(chatContainer).append(`<div class="wide100p" id="tableStatusContainer">${r}</div>`); // 添加新的 tableStatusContainer
        const tableStatusContainer = chatContainer?.querySelector('#table_push_to_chat_sheets');
        renderEditableSheetsDOM(sheets, tableStatusContainer);

        // 获取新创建的 tableStatusContainer
        const newTableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');
        if (newTableStatusContainer) {
            // 添加事件监听器，使用具名函数
            newTableStatusContainer.addEventListener('touchstart', touchstartHandler, {passive: false});
            newTableStatusContainer.addEventListener('touchmove', touchmoveHandler, {passive: false});
            newTableStatusContainer.addEventListener('touchend', touchendHandler, {passive: false});
        }
        // console.log('tableStatusContainer:', newTableStatusContainer);
    }, 0);
}

/**
 * 更新最后一条 System 消息的 <tableStatus> 标签内容
 */
export function updateSystemMessageTableStatus(force = false) {
    console.log("更新最后一条 System 消息的 <tableStatus> 标签内容", USER.tableBaseSetting.isTableToChat)
    if (force === false) {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isTableToChat === false) {
            window.document.querySelector('#tableStatusContainer')?.remove();
            return;
        }
    }
    // console.log("更新最后一条 System ")
    const sheets = BASE.hashSheetsToSheets(BASE.getLastSheetsPiece()?.piece.hash_sheets);

    replaceTableToStatusTag(sheets);
}

/**
 * 新增代码，打开自定义表格推送渲染器弹窗
 * @returns {Promise<void>}
 */
export async function openTableRendererPopup() {
    const manager = await SYSTEM.getTemplate('customSheetStyle');
    const tableRendererPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const sheetsData = BASE.getLastSheetsPiece()?.piece.hash_sheets;
    if (!sheetsData) {
        // console.warn("openTableRendererPopup: 未能获取到有效的 table 对象。");
        return;
    }
    const sheets = BASE.hashSheetsToSheets(sheetsData)[0];
    let sheetElements = '';
    for (let sheet of sheets) {
        if (!sheet.tochat) continue;
        if (!sheet.data.customStyle || sheet.data.customStyle === '') {
            sheetElements += sheet.renderSheet().outerHTML;
            continue;
        }
        // parseTableRender()
    }

    const $dlg = $(tableRendererPopup.dlg);
    const $htmlEditor = $dlg.find('#htmlEditor');
    const $tableRendererDisplay = $dlg.find('#tableRendererDisplay');

    // 修改中实时渲染
    const renderHTML = () => {
        $tableRendererDisplay.html(sheetElements);
    };

    renderHTML();
    $htmlEditor.on('input', renderHTML); // 监听 input 事件，实时渲染

    await tableRendererPopup.show();
}
