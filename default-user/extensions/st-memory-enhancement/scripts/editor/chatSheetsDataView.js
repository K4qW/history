import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { findNextChatWhitTableData, } from "../../index.js";
import { rebuildSheets } from "../runtime/absoluteRefresh.js";
import { openTableHistoryPopup } from "./tableHistory.js";
import { PopupMenu } from "../../components/popupMenu.js";
import {openTableStatisticsPopup} from "./tableStatistics.js";
import {openCellHistoryPopup} from "./cellHistory.js";
import {openSheetStyleRendererPopup} from "./sheetStyleEditor.js";

let tablePopup = null
let copyTableData = {}
let selectedCell = null
let editModeSelectedRows = []
let viewSheetsContainer = null
let lastCellsHashSheet = null
const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}

/**
 * 复制表格
 * @param {*} tables 所有表格数据
 */
export async function copyTable() {
    copyTableData = {}
    copyTableData.hash_sheets = BASE.getLastSheetsPiece().piece.hash_sheets
    copyTableData.sheets_data = BASE.sheetsData.context

    $('#table_drawer_icon').click()

    EDITOR.confirm(`正在复制表格数据 (#${SYSTEM.generateRandomString(4)})`, '取消', '粘贴到当前对话').then(async (r) => {
        if (r) {
            await pasteTable()
        }
        if ($('#table_drawer_icon').hasClass('closedIcon')) {
            $('#table_drawer_icon').click()
        }
    })
}

/**
 * 粘贴表格
 * @param {number} mesId 需要粘贴到的消息id
 * @param {Element} viewSheetsContainer 表格容器DOM
 */
async function pasteTable() {
    if (USER.getContext().chat.length === 0) {
        EDITOR.error("请至少让ai回复一条消息作为表格载体")
        return
    }
    const confirmation = await EDITOR.callGenericPopup('粘贴会清空原有的表格数据，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        if (copyTableData) {
            USER.getChatPiece().hash_sheets = copyTableData.hash_sheets
            BASE.sheetsData.context = copyTableData.sheets_data
            USER.saveChat()
        } else {
            EDITOR.error("粘贴失败：剪切板没有表格数据")
        }
    }
}

/**
 * 导入表格
 * @param {number} mesId 需要导入表格的消息id
 */
async function importTable(mesId, viewSheetsContainer) {
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
                const tables = JSON.parse(loadEvent.target.result)
                // loadEvent.target.result 包含了读取到的文件内容 (文本格式)
                try {
                    // // 5. 尝试解析 JSON 数据
                    USER.getChatPiece().dataTable = tables
                    renderSheetsDOM()
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
async function exportTable() {
    if (!DERIVED.any.renderingSheets || DERIVED.any.renderingSheets.length === 0) {
        EDITOR.warning('当前表格没有数据，无法导出');
        return;
    }
    const sheets = DERIVED.any.renderingSheets
    const csvTables = sheets.map(sheet => "SHEET-START"+sheet.uid+"\n"+sheet.getSheetCSV(false)+"SHEET-END").join('\n')
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvTables], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'table_data.csv'; // 默认文件名
    document.body.appendChild(downloadLink); // 必须添加到 DOM 才能触发下载
    downloadLink.click();
    document.body.removeChild(downloadLink); // 下载完成后移除

    URL.revokeObjectURL(url); // 释放 URL 对象

    EDITOR.success('已导出');
}

/**
 * 清空表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} viewSheetsContainer 表格容器DOM
 */
async function clearTable(mesId, viewSheetsContainer) {
    if (mesId === -1) return
    const confirmation = await EDITOR.callGenericPopup('清空当前对话的所有表格数据，并重置历史记录，该操作无法回退，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        await USER.getContext().chat.forEach((piece => {
            if (piece.hash_sheets) {
                delete piece.hash_sheets
            }
            if(piece.dataTable) delete piece.dataTable
        }))
        setTimeout(() => {
            USER.saveSettings()
            USER.saveChat();
            BASE.refreshContextView()
            EDITOR.success("表格数据清除成功")
            console.log("已清除表格数据")
        }, 100)
    }
}

/**
 * 设置表格编辑Tips
 * @param {Element} tableEditTips 表格编辑提示DOM
 */
function setTableEditTips(tableEditTips) {
    /* if (!tableEditTips || tableEditTips.length === 0) {
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
    } */
}

async function cellDataEdit(cell) {
    const result = await EDITOR.callGenericPopup("编辑单元格", EDITOR.POPUP_TYPE.INPUT, cell.data.value, { rows: 3 })
    if (result) {
        cell.editCellData({ value: result })
        refreshContextView(true);
        if(cell.type === cell.CellType.column_header) BASE.refreshTempView(true)
    }
}


async function columnDataEdit(cell) {
    const columnEditor = `
<div class="column-editor">
    <div class="column-editor-header">
        <h3>编辑列数据</h3>
    </div>
    <div class="column-editor-body">
        <div class="column-editor-content">
            <label for="column-editor-input">列数据:</label>
            <textarea id="column-editor-input" rows="5"></textarea>
        </div>
    </div>
</div>
`
    const columnCellDataPopup = new EDITOR.Popup(columnEditor, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "应用修改", cancelButton: "取消" });
    const historyContainer = $(columnCellDataPopup.dlg)[0];

    await columnCellDataPopup.show();

    if (columnCellDataPopup.result) {
        // cell.editCellData({ value: result })
        refreshContextView(true);
    }
}

function batchEditMode(cell) {
    DERIVED.any.batchEditMode = true;
    DERIVED.any.batchEditModeSheet = cell.parent;
    EDITOR.confirm(`正在编辑 #${cell.parent.name} 的行`, '取消', '保存修改').then((r) => {
        DERIVED.any.batchEditMode = false;
        DERIVED.any.batchEditModeSheet = null;
        renderSheetsDOM();
    })
    renderSheetsDOM();
}

// 新的事件处理函数
export function cellClickEditModeEvent(cell) {
    cell.element.style.cursor = 'pointer'
    if (cell.type === cell.CellType.row_header) {
        cell.element.textContent = ''

        // 在 cell.element 中添加三个 div，一个用于显示排序，一个用于显示锁定按钮，一个用于显示删除按钮
        const containerDiv = $(`<div class="flex-container" style="display: flex; flex-direction: row; justify-content: space-between; width: 100%;"></div>`)
        const rightDiv = $(`<div class="flex-container" style="margin-right: 3px"></div>`)
        const indexDiv = $(`<span class="menu_button_icon interactable" style="margin: 0; padding: 0 6px; cursor: move; color: var(--SmartThemeBodyColor)">${cell.position[0]}</span>`)
        const lockDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-lock" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)
        const deleteDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-xmark redWarningBG" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)

        $(lockDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (cell._pre_deletion) return

            cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target.locked = !target.locked
                        target.element.style.backgroundColor = target.locked ? '#00ff0022' : ''
                    })
                }
            })
        })
        $(deleteDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (cell.locked) return

            cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target._pre_deletion = !target._pre_deletion
                        target.element.style.backgroundColor = target._pre_deletion ? '#ff000044' : ''
                    })
                }
            })
        })

        $(rightDiv).append(lockDiv).append(deleteDiv)
        $(containerDiv).append(indexDiv).append(rightDiv)
        $(cell.element).append(containerDiv)

    } else if (cell.type === cell.CellType.cell) {
        cell.element.style.cursor = 'text'
        cell.element.contentEditable = true
        cell.element.focus()
        cell.element.addEventListener('blur', (e) => {
            e.stopPropagation();
            e.preventDefault();
            cell.data.value = cell.element.textContent.trim()
        })
    }

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();
    })
}

async function confirmAction(event, text = '是否继续该操作？') {
    const confirmation = new EDITOR.Popup(text, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });

    await confirmation.show();
    if (!confirmation.result) return { filterData: null, confirmation: false };
    event()
}

/**
 * 单元格高亮
 */
export function cellHighlight(sheet) {
    const lastHashSheet = lastCellsHashSheet[sheet.uid] || []
    const changeSheet = sheet.hashSheet.map((row) => {
        const isNewRow = lastHashSheet.includes(row[0])
        return row.map((hash) => {
            if (!isNewRow) return { hash, type: "newRow" }
            if (!lastHashSheet.includes(hash)) return { hash, type: "update" }
            return { hash, type: "keep" }
        })
    })
    changeSheet.forEach((row) => {
        row.forEach((cell) => {
            const cellElement = sheet.cells.get(cell.hash).element
            if (cell.type === "newRow") {
                cellElement.style.backgroundColor = '#00ff0011'
            } else if (cell.type === "update") {
                cellElement.style.backgroundColor = '#0000ff11'
            }
        })
    })
}

async function cellHistoryView(cell) {
    await openCellHistoryPopup(cell)
}

/**
 * 自定义表格样式事件
 * @param {*} cell 
 */
async function customSheetStyle(cell) {
    await openSheetStyleRendererPopup(cell.parent)
    await refreshContextView(true);
}

function cellClickEvent(cell) {
    cell.element.style.cursor = 'pointer'

    // 判断是否需要根据历史数据进行高亮
    /* const lastCellUid = lastCellsHashSheet.has(cell.uid)
    if (!lastCellUid) {
        cell.element.style.backgroundColor = '#00ff0011'
    }
    else if (cell.parent.cells.get(lastCellUid).data.value !== cell.data.value) {
        cell.element.style.backgroundColor = '#0000ff11'
    } */

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();

        if (cell.parent.currentPopupMenu) {
            cell.parent.currentPopupMenu.destroy();
            cell.parent.currentPopupMenu = null;
        }
        cell.parent.currentPopupMenu = new PopupMenu();

        const menu = cell.parent.currentPopupMenu;
        const [rowIndex, colIndex] = cell.position;
        const sheetType = cell.parent.type;

        if (rowIndex === 0 && colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> 行编辑', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-right"></i> 向右插入列', () => handleAction(cell, cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-arrow-down"></i> 向下插入行', () => handleAction(cell, cell.CellAction.insertDownRow));
            menu.add('<i class="fa-solid fa-wand-magic-sparkles"></i> 自定义表格样式', async() => customSheetStyle(cell) );
        } else if (colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> 行编辑', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-up"></i> 向上插入行', () => handleAction(cell, cell.CellAction.insertUpRow));
            menu.add('<i class="fa fa-arrow-down"></i> 向下插入行', () => handleAction(cell, cell.CellAction.insertDownRow));
            menu.add('<i class="fa fa-trash-alt"></i> 删除行', () => handleAction(cell, cell.CellAction.deleteSelfRow), menu.ItemType.warning )
        } else if (rowIndex === 0) {
            menu.add('<i class="fa fa-i-cursor"></i> 编辑该列', async () => await cellDataEdit(cell));
            menu.add('<i class="fa fa-arrow-left"></i> 向左插入列', () => handleAction(cell, cell.CellAction.insertLeftColumn));
            menu.add('<i class="fa fa-arrow-right"></i> 向右插入列', () => handleAction(cell, cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-trash-alt"></i> 删除列', () => confirmAction(() => { handleAction(cell, cell.CellAction.deleteSelfColumn) }, '确认删除列？'), menu.ItemType.warning);
        } else {
            menu.add('<i class="fa fa-i-cursor"></i> 编辑该单元格', async () => await cellDataEdit(cell));
            menu.add('<i class="fa-solid fa-clock-rotate-left"></i> 单元格历史记录', async () => await cellHistoryView(cell));
        }

        // 设置弹出菜单后的一些非功能性派生操作，这里必须使用setTimeout，否则会导致菜单无法正常显示
        setTimeout(() => {

        }, 0)

        // 备份当前cell的style，以便在菜单关闭时恢复
        const style = cell.element.style.cssText;

        // 获取单元格位置
        const rect = cell.element.getBoundingClientRect();
        const tableRect = viewSheetsContainer.getBoundingClientRect();

        // 计算菜单位置（相对于表格容器）
        const menuLeft = rect.left - tableRect.left;
        const menuTop = rect.bottom - tableRect.top;
        const menuElement = menu.renderMenu();
        $(viewSheetsContainer).append(menuElement);

        // 高亮cell
        cell.element.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        cell.element.style.color = 'var(--SmartThemeQuoteColor)';
        cell.element.style.outline = '1px solid var(--SmartThemeQuoteColor)';
        cell.element.style.zIndex = '999';

        menu.show(menuLeft, menuTop).then(() => {
            cell.element.style.cssText = style;
        })
        menu.frameUpdate((menu) => {
            // 重新定位菜单
            const rect = cell.element.getBoundingClientRect();
            const tableRect = viewSheetsContainer.getBoundingClientRect();

            // 计算菜单位置（相对于表格容器）
            const menuLeft = rect.left - tableRect.left;
            const menuTop = rect.bottom - tableRect.top;
            menu.popupContainer.style.left = `${menuLeft}px`;
            menu.popupContainer.style.top = `${menuTop + 3}px`;
        })
    })
    cell.on('', () => {
        console.log('cell发生了改变:', cell)
    })
}

function handleAction(cell, action){
    cell.newAction(action)
    refreshContextView(true);
    if(cell.type === cell.CellType.column_header) BASE.refreshTempView(true)
}

export async function renderEditableSheetsDOM(_sheets, _viewSheetsContainer, _cellClickEvent = cellClickEvent) {
    for (let [index, sheet] of _sheets.entries()) {
        if(!sheet.enable) continue
        const instance = new BASE.Sheet(sheet)
        console.log("渲染：",instance)
        const sheetContainer = document.createElement('div')
        const sheetTitleText = document.createElement('h3')
        sheetContainer.style.overflowX = 'none'
        sheetContainer.style.overflowY = 'auto'
        sheetTitleText.innerText = `#${index} ${sheet.name}`

        let sheetElement = null

        if (DERIVED.any.batchEditMode === true) {
            if (DERIVED.any.batchEditModeSheet?.name === instance.name) {
                sheetElement = await instance.renderSheet(cellClickEditModeEvent)
            } else {
                sheetElement = await instance.renderSheet((cell) => {
                    cell.element.style.cursor = 'default'
                })
                sheetElement.style.cursor = 'default'
                sheetElement.style.opacity = '0.5'
                sheetTitleText.style.opacity = '0.5'
            }
        } else {
            sheetElement = instance.renderSheet(_cellClickEvent)
        }
        cellHighlight(instance)
        $(sheetContainer).append(sheetElement)

        $(_viewSheetsContainer).append(sheetTitleText)
        $(_viewSheetsContainer).append(sheetContainer)
        $(_viewSheetsContainer).append(`<hr>`)
    }
}

async function renderSheetsDOM() {
    const task = new SYSTEM.taskTiming('renderSheetsDOM_task')

    updateSystemMessageTableStatus();
    task.log()
    const { piece, deep } = BASE.getLastSheetsPiece();
    if (!piece || !piece.hash_sheets) return;

    const sheets = BASE.hashSheetsToSheets(piece.hash_sheets);
    console.log('renderSheetsDOM:', piece, sheets)
    DERIVED.any.renderingSheets = sheets
    task.log()
    // 用于记录上一次的hash_sheets，渲染时根据上一次的hash_sheets进行高亮
    lastCellsHashSheet = BASE.getLastSheetsPiece(deep - 1, 3, false)?.piece.hash_sheets;
    // console.log("找到的diff前项", lastCellsHashSheet)
    if (lastCellsHashSheet) {
        lastCellsHashSheet = BASE.copyHashSheets(lastCellsHashSheet)
        for (const sheetUid in lastCellsHashSheet) {
            lastCellsHashSheet[sheetUid] = lastCellsHashSheet[sheetUid].flat()
        }
    }
    task.log()
    $(viewSheetsContainer).empty()
    viewSheetsContainer.style.paddingBottom = '150px'
    renderEditableSheetsDOM(sheets, viewSheetsContainer)
    task.log()
}

let initializedTableView = null
async function initTableView(mesId) {
    initializedTableView = $(await SYSTEM.getTemplate('manager')).get(0);
    viewSheetsContainer = initializedTableView.querySelector('#tableContainer');

    // setTableEditTips($(initializedTableView).find('#tableEditTips'));    // 确保在 table_manager_container 存在的情况下查找 tableEditTips

    // 设置编辑提示
    // 点击打开查看表格数据统计
    $(document).on('click', '#table_data_statistics_button', function () {
        openTableStatisticsPopup();
    })
    // 点击打开查看表格历史按钮
    $(document).on('click', '#dataTable_history_button', function () {
        openTableHistoryPopup();
    })
    // 点击清空表格按钮
    $(document).on('click', '#clear_table_button', function () {
        clearTable(userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    $(document).on('click', '#table_rebuild_button', function () {
        rebuildSheets()
    })
    // 点击编辑表格按钮
    $(document).on('click', '#table_edit_mode_button', function () {
        // openTableEditorPopup();
    })
    // 点击复制表格按钮
    $(document).on('click', '#copy_table_button', function () {
        copyTable();
    })
    // 点击导入表格按钮
    $(document).on('click', '#import_clear_up_button', function () {
        importTable(userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    // 点击导出表格按钮
    $(document).on('click', '#export_table_button', function () {
        exportTable();
    })

    return initializedTableView;
}

export async function refreshContextView() {
    renderSheetsDOM();
    console.log("刷新表格视图")
}

export async function getChatSheetsView(mesId = -1) {
    // 如果已经初始化过，直接返回缓存的容器，避免重复创建
    if (initializedTableView) {
        // 更新表格内容，但不重新创建整个容器
        renderSheetsDOM();
        return initializedTableView;
    }
    return await initTableView(mesId);
}
