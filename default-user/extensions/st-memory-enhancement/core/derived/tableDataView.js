import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import { updateSystemMessageTableStatus } from "./tablePushToChat.js";
import {
    copyTableList,
    findLastestTableData,
    findNextChatWhitTableData,
    getTableEditActionsStr,
    handleEditStrInMessage,
    parseTableEditTag,
    replaceTableEditTag,
} from "../../index.js";
import { rebuildTableActions, refreshTableActions, getPromptAndRebuildTable } from "./absoluteRefresh.js";
import { initAllTable } from "../source/tableActions.js";
import { openTableHistoryPopup } from "./tableHistory.js";
import { initRefreshTypeSelector } from "./initRefreshTypeSelector.js";

let tablePopup = null
let copyTableData = null
let selectedCell = null
const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}

/**
 * 表格编辑浮窗
 */
const tableEditToolbarDom = `<div class="popup popup--animation-fast tableToolbar" id="tableToolbar">
    <button id="editCell" class="menu_button">编辑</button>
    <button id="deleteRow" class="menu_button">删除行</button>
    <button id="insertRow" class="menu_button">下方插入行</button>
</div>`

/**
 * 表头编辑浮窗
 */
const tableHeaderEditToolbarDom = `
<div class="popup popup--animation-fast tableToolbar" id="tableHeaderToolbar">
    <button id="insertRow" class="menu_button">下方插入行</button>
</div>`


export function tableCellClickEvent(table) {
    if (userTableEditInfo.editAble) {
        $(table).on('click', 'td', onTdClick)
        $(table).on('click', 'th', onTdClick)
    }
}

/**
 * 处理表格中的单元格点击事件
 * @param {Event} event 点击事件
 */
function onTdClick(event) {
    if (selectedCell) {
        selectedCell.removeClass("selected");
    }
    selectedCell = $(this);
    selectedCell.addClass("selected");
    saveTdData(selectedCell.data("tableData"))
    // 计算工具栏位置
    const cellOffset = selectedCell.offset();
    const containerOffset = $("#tableContainer").offset(); // 这里假设 #tableContainer 存在于页面中，如果不在页面中，需要调整 offset 计算方式
    const relativeX = cellOffset.left - containerOffset.left;
    const relativeY = cellOffset.top - containerOffset.top;
    const clickedElement = event.target;
    hideAllEditPanels()
    if (clickedElement.tagName.toLowerCase() === "td") {
        $("#tableToolbar").css({
            top: relativeY + 32 + "px",
            left: relativeX + "px"
        }).show();
    } else if (clickedElement.tagName.toLowerCase() === "th") {
        $("#tableHeaderToolbar").css({
            top: relativeY + 32 + "px",
            left: relativeX + "px"
        }).show();
    }
    event.stopPropagation(); // 阻止事件冒泡
}

/**
 * 隐藏所有的编辑浮窗
 */
function hideAllEditPanels() {
    $("#tableToolbar").hide();
    $("#tableHeaderToolbar").hide();
}

/**
 * 将保存的data数据字符串保存到设置中
 * @param {string} data 保存的data属性字符串
 */
function saveTdData(data) {
    const [tableIndex, rowIndex, colIndex] = data.split("-");
    userTableEditInfo.tableIndex = parseInt(tableIndex);
    userTableEditInfo.rowIndex = parseInt(rowIndex);
    userTableEditInfo.colIndex = parseInt(colIndex);
}

/**
 * 复制表格
 * @param {*} tables 所有表格数据
 */
export async function copyTable(tables = []) {
    copyTableData = JSON.stringify(tables)
    EDITOR.success('已复制')
}

/**
 * 粘贴表格
 * @param {number} mesId 需要粘贴到的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
export async function pasteTable(mesId, tableContainer) {
    if (mesId === -1) {
        EDITOR.error("请至少让ai回复一条消息作为表格载体")
        return
    }
    const confirmation = await EDITOR.callGenericPopup('粘贴会清空原有的表格数据，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        if (copyTableData) {
            const tables = JSON.parse(copyTableData)
            checkPrototype(tables)
            USER.getContext().chat[mesId].dataTable = tables
            renderTablesDOM(tables, tableContainer, true)
            updateSystemMessageTableStatus();
            EDITOR.success('粘贴成功')
        } else {
            EDITOR.error("粘贴失败：剪切板没有表格数据")
        }
    }
}

/**
 * 导入表格
 * @param {number} mesId 需要导入表格的消息id
 */
async function importTable(mesId, tableContainer) {
    if (mesId === -1) {
        EDITOR.error("请至少让ai回复一条消息作为表格载体")
        return
    }

    // 1. 创建一个 input 元素，类型设置为 'file'，用于文件选择
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // 设置 accept 属性，限制只能选择 JSON 文件，提高用户体验
    fileInput.accept = '.json';

    // 2. 添加事件监听器，监听文件选择的变化 (change 事件)
    fileInput.addEventListener('change', function (event) {
        // 获取用户选择的文件列表 (FileList 对象)
        const files = event.target.files;

        // 检查是否选择了文件
        if (files && files.length > 0) {
            // 获取用户选择的第一个文件 (这里假设只选择一个 JSON 文件)
            const file = files[0];

            // 3. 创建 FileReader 对象，用于读取文件内容
            const reader = new FileReader();

            // 4. 定义 FileReader 的 onload 事件处理函数
            // 当文件读取成功后，会触发 onload 事件
            reader.onload = function (loadEvent) {
                // loadEvent.target.result 包含了读取到的文件内容 (文本格式)
                const fileContent = loadEvent.target.result;

                try {
                    // 5. 尝试解析 JSON 数据
                    const tables = JSON.parse(fileContent)
                    checkPrototype(tables)
                    USER.getContext().chat[mesId].dataTable = tables
                    renderTablesDOM(tables, tableContainer, true)
                    updateSystemMessageTableStatus();
                    EDITOR.success('导入成功')
                } catch (error) {
                    // 7. 捕获 JSON 解析错误，并打印错误信息
                    console.error("JSON 解析错误:", error);
                    alert("JSON 文件解析失败，请检查文件格式是否正确。");
                }
            };

            reader.readAsText(file, 'UTF-8'); // 建议指定 UTF-8 编码，确保中文等字符正常读取
        }
    });
    fileInput.click();
}

/**
 * 导出表格
 * @param {Array} tables 所有表格数据
 */
async function exportTable(tables = []) {
    if (!tables || tables.length === 0) {
        EDITOR.warning('当前表格没有数据，无法导出');
        return;
    }

    const jsonTables = JSON.stringify(tables, null, 2); // 使用 2 空格缩进，提高可读性
    const blob = new Blob([jsonTables], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'table_data.json'; // 默认文件名
    document.body.appendChild(downloadLink); // 必须添加到 DOM 才能触发下载
    downloadLink.click();
    document.body.removeChild(downloadLink); // 下载完成后移除

    URL.revokeObjectURL(url); // 释放 URL 对象

    EDITOR.success('已导出');
}

/**
 * 清空表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function clearTable(mesId, tableContainer) {
    if (mesId === -1) return
    const confirmation = await EDITOR.callGenericPopup('清空此条的所有表格数据，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        const emptyTable = initAllTable()
        USER.getContext().chat[mesId].dataTable = emptyTable
        renderTablesDOM(emptyTable, tableContainer, true)
        updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
        EDITOR.success('清空成功')
    }
}


/**
 * 在actions中插入值
 */
function addActionForInsert() {
    const newAction = new DERIVED.TableEditAction()
    newAction.setActionInfo("Insert", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex, {})
    DERIVED.any.tableEditActions.push(newAction)
}

/**
 * 下方插入行事件
 */
async function onInsertRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接插入', result: 3 }
    const result = await EDITOR.callGenericPopup("请选择插入方式，目前伪装插入只能插入在表格底部<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", EDITOR.POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI插入", cancelButton: "取消", customButtons: [button] })
    const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
    if (result) {
        // 伪装输出
        if (result !== 3) {
            addActionForInsert()
            const chat = USER.getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(USER.getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = DERIVED.any.waitingTable
        } else {
            table.insertEmptyRow(userTableEditInfo.rowIndex + 1)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        updateSystemMessageTableStatus();
        USER.getContext().saveChat()
        EDITOR.success('已插入')
    }
}

/**
 * 首行插入事件
 */
async function onInsertFirstRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接插入', result: 3 }
    const result = await EDITOR.callGenericPopup("请选择插入方式，目前伪装插入只能插入在表格底部<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", EDITOR.POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI插入", cancelButton: "取消", customButtons: [button] })
    const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
    if (result) {
        // 伪装输出
        if (result !== 3) {
            addActionForInsert()
            const chat = USER.getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(USER.getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = DERIVED.any.waitingTable
        } else {
            table.insertEmptyRow(0)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        updateSystemMessageTableStatus();
        USER.getContext().saveChat()
        EDITOR.success('已插入')
    }
}

/**
 * 寻找actions中是否有与修改值相关的行动，有则修改
 */
function findAndEditOrAddActionsForUpdate(newValue) {
    let haveAction = false
    DERIVED.any.tableEditActions.forEach((action) => {
        if (action.type === 'Update' || action.type === 'Insert') {
            if (action.tableIndex === userTableEditInfo.tableIndex && action.rowIndex === userTableEditInfo.rowIndex) {
                action.data[userTableEditInfo.colIndex] = newValue
                haveAction = true
            }
        }
    })
    if (!haveAction) {
        const newAction = new DERIVED.TableEditAction()
        const data = {}
        data[userTableEditInfo.colIndex] = newValue
        newAction.setActionInfo("Update", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex, data)
        DERIVED.any.tableEditActions.push(newAction)
    }
}

/**
 * 寻找actions中是否有与删除值相关的行动，有则删除
 */
function findAndDeleteActionsForDelete() {
    let haveAction = false
    DERIVED.any.tableEditActions.forEach(action => {
        if (action.tableIndex === userTableEditInfo.tableIndex && action.rowIndex === userTableEditInfo.rowIndex) {
            action.able = false
            haveAction = true
            if (action.type === 'Update') {
                const newAction = new DERIVED.TableEditAction()
                newAction.setActionInfo("Delete", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex)
                DERIVED.any.tableEditActions.push(newAction)
            }
        }
    })
    DERIVED.any.tableEditActions = DERIVED.any.tableEditActions.filter(action => action.able)
    if (!haveAction) {
        const newAction = new DERIVED.TableEditAction()
        newAction.setActionInfo("Delete", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex)
        DERIVED.any.tableEditActions.push(newAction)
    }
}

/**
 * 设置表格编辑Tips
 * @param {Element} tableEditTips 表格编辑提示DOM
 */
function setTableEditTips(tableEditTips) {
    if (!tableEditTips || tableEditTips.length === 0) {
        console.error('tableEditTips is null or empty jQuery object');
        return;
    }
    const tips = $(tableEditTips); // 确保 tableEditTips 是 jQuery 对象
    tips.empty();
    if (USER.tableBaseSetting.isExtensionAble === false) {
        tips.append('目前插件已关闭，将不会要求AI更新表格。');
        tips.css("color", "rgb(211 39 39)");
    } else if (userTableEditInfo.editAble) {
        tips.append('点击单元格选择编辑操作。绿色单元格为本轮插入，蓝色单元格为本轮修改。');
        tips.css("color", "lightgreen");
    } else {
        tips.append('此表格为中间表格，为避免混乱，不可被编辑和粘贴。你可以打开最新消息的表格进行编辑');
        tips.css("color", "lightyellow");
    }
}

/**
 * 渲染所有表格DOM及编辑栏
 * @param {Array} tables 所有表格数据
 * @param {Element} tableContainer 表格DOM容器
 * @param {boolean} isEdit 是否可以编辑
 */
export function renderTablesDOM(tables = [], tableContainer, isEdit = false) {
    $(tableContainer).empty()
    if (isEdit) {
        const tableToolbar = $(tableEditToolbarDom)
        const tableHeaderToolbar = $(tableHeaderEditToolbarDom)
        tableToolbar.on('click', '#deleteRow', onDeleteRow)
        tableToolbar.on('click', '#editCell', onModifyCell)
        tableToolbar.on('click', '#insertRow', onInsertRow)
        tableHeaderToolbar.on('click', '#insertRow', onInsertFirstRow)
        $(tableContainer).append(tableToolbar)
        $(tableContainer).append(tableHeaderToolbar)
    }
    for (let table of tables) {
        $(tableContainer).append(table.render()).append(`<hr />`)
    }
}

/**
 * 删除行事件
 */
async function onDeleteRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接修改', result: 3 }
    const result = await EDITOR.callGenericPopup("请选择删除方式<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", EDITOR.POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI删除", cancelButton: "取消", customButtons: [button] })
    if (result) {
        // 伪装修改
        if (result !== 3) {
            if (!table.insertedRows || !table.updatedRows)
                return EDITOR.error("由于旧数据兼容性问题，请再聊一次后再使用此功能")
            findAndDeleteActionsForDelete()
            const chat = USER.getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(USER.getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = DERIVED.any.waitingTable
        } else {
            table.delete(userTableEditInfo.rowIndex)
        }
        const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        updateSystemMessageTableStatus();
        USER.getContext().saveChat()
        EDITOR.success('已删除')
    }
}

/**
 * 修改单元格事件
 */
async function onModifyCell() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const cellValue = table.getCellValue(userTableEditInfo.rowIndex, userTableEditInfo.colIndex)
    const button = { text: '直接修改', result: 3 }
    const tableEditPopup = new EDITOR.Popup("注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", EDITOR.POPUP_TYPE.INPUT, cellValue, { okButton: "伪装为AI修改", cancelButton: "取消", customButtons: [button], rows: 5 });
    const newValue = await tableEditPopup.show()
    if (newValue) {
        const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
        // 伪装修改
        if (tableEditPopup.result !== 3) {
            findAndEditOrAddActionsForUpdate(newValue)
            const chat = USER.getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(USER.getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = DERIVED.any.waitingTable
        } else {
            table.setCellValue(userTableEditInfo.rowIndex, userTableEditInfo.colIndex, newValue)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        updateSystemMessageTableStatus();
        USER.getContext().saveChat()
        EDITOR.success('已修改')
    }
}

let initializedTableView = null

/**
 * 初始化表格展示DOM
 * @param {number} mesId 
 * @returns {Promise<Document | HTMLElement>}
 */
async function initTableView(mesId) { // 增加 table_manager_container 参数
    const table_manager_container = await SYSTEM.htmlToDom(await SYSTEM.getComponent('manager'), 'table_manager_container');
    const tableContainer = table_manager_container.querySelector('#tableContainer');

    userTableEditInfo.editAble = findNextChatWhitTableData(mesId).index === -1

    // 确保在 table_manager_container 存在的情况下查找 tableEditTips
    setTableEditTips($(table_manager_container).find('#tableEditTips'));


    // 开始寻找表格
    const { tables, index } = await findLastestTableData(true, mesId)
    userTableEditInfo.chatIndex = index
    userTableEditInfo.tables = tables

    // 获取action信息
    if (userTableEditInfo.editAble && index !== -1 && (!DERIVED.any.waitingTableIndex || DERIVED.any.waitingTableIndex !== index)) {
        parseTableEditTag(USER.getContext().chat[index], -1, true)
    }

    // 渲染
    renderTablesDOM(userTableEditInfo.tables, tableContainer, userTableEditInfo.editAble)
    tables[0].cellClickEvent(callback => {
        console.log(callback)
    })

    initializedTableView = table_manager_container;
    return initializedTableView;
}

/**
 * 绑定表头上方按钮相关事件
 */
export function bindTableHeaderButtonEvent() {
    const dlg = $(tablePopup.dlg)
    const tableContainer = dlg.find("#tableContainer")[0]
    console.log("绑定表头上方按钮相关事件", tableContainer)
    // 设置编辑提示
    // 点击打开查看表格历史按钮
    dlg.on('click', '#dataTable_history_button', function () {
        openTableHistoryPopup();
    })
    // 点击清空表格按钮
    dlg.on('click', '#clear_table_button', function () {
        clearTable(userTableEditInfo.chatIndex, tableContainer);
    })
    dlg.on('click', '#table_rebuild_button', function () {
        // rebuildTableActions(USER.tableBaseConfig.bool_force_refresh, USER.tableBaseConfig.bool_silent_refresh);
        getPromptAndRebuildTable();
    })
    // 点击编辑表格按钮
    dlg.on('click', '#table_edit_mode_button', function () {
        // openTableEditorPopup();
    })
    // 点击复制表格按钮
    dlg.on('click', '#copy_table_button', function () {
        copyTable(userTableEditInfo.tables);
    })
    // 点击粘贴表格按钮
    dlg.on('click', '#paste_table_button', function () {
        pasteTable(userTableEditInfo.chatIndex, tableContainer);
    })
    // 点击导入表格按钮
    dlg.on('click', '#import_clear_up_button', function () {
        importTable(userTableEditInfo.chatIndex, tableContainer);
    })
    // 点击导出表格按钮
    dlg.on('click', '#export_table_button', function () {
        exportTable(userTableEditInfo.tables);
    })
}

export async function getTableView(mesId = -1) {
    return initializedTableView || await initTableView(mesId);
}

/**
 * 打开表格展示/编辑弹窗
 * @param {number} mesId 需要打开的消息ID，-1为最新一条
 */
export async function openTablePopup(mesId = -1) {
    const tableContainer = await initTableView(mesId);
    tablePopup = new EDITOR.Popup(tableContainer, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    bindTableHeaderButtonEvent()
    await tablePopup.show()
}
