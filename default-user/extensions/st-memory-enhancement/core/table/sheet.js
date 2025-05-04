import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import {SheetBase} from "./base.js";
import {cellStyle, filterSavingData} from "./utils.js";

/**
 * 表格类，用于管理表格数据
 * @description 表格类用于管理表格数据，包括表格的名称、域、类型、单元格数据等
 * @description 表格类还提供了对表格的操作，包括创建、保存、删除、渲染等
 */
export class Sheet extends SheetBase {
    constructor(target = null) {
        super(target);

        this.currentPopupMenu = null;           // 用于跟踪当前弹出的菜单 - 移动到 Sheet (如果需要PopupMenu仍然在Sheet中管理)
        this.element = null;                    // 用于存储渲染后的 table 元素
        this.lastCellEventHandler = null;       // 保存最后一次使用的 cellEventHandler
        this.template = null;       // 用于存储模板
        this.#load(target);
    }

    /**
     * 渲染表格
     * @description 接受 cellEventHandler 参数，提供一个 `Cell` 对象作为回调函数参数，用于处理单元格事件
     * @description 可以通过 `cell.parent` 获取 Sheet 对象，因此不再需要传递 Sheet 对象
     * @description 如果不传递 cellEventHandler 参数，则使用上一次的 cellEventHandler
     * @param {Function} cellEventHandler
     * @param targetHashSheet
     * */
    renderSheet(cellEventHandler = this.lastCellEventHandler, targetHashSheet = this.hashSheet) {
        this.lastCellEventHandler = cellEventHandler;

        if (!this.element) {
            this.element = document.createElement('table');
            this.element.classList.add('sheet-table', 'tableDom');
            this.element.style.position = 'relative';
            this.element.style.display = 'flex';
            this.element.style.flexDirection = 'column';
            this.element.style.flexGrow = '0';
            this.element.style.flexShrink = '1';

            const styleElement = document.createElement('style');
            styleElement.textContent = cellStyle;
            this.element.appendChild(styleElement);
        }

        // 确保 element 中有 tbody，没有则创建
        let tbody = this.element.querySelector('tbody');
        if (!tbody) {
            tbody = document.createElement('tbody');
            this.element.appendChild(tbody);
        }
        // 清空 tbody 的内容
        tbody.innerHTML = '';

        // 遍历 hashSheet，渲染每一个单元格
        targetHashSheet.forEach((rowUids, rowIndex) => {
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                const cell = this.cells.get(cellUid)
                const cellElement = cell.initCellRender(rowIndex, colIndex);
                rowElement.appendChild(cellElement);    // 调用 Cell 的 initCellRender 方法，仍然需要传递 rowIndex, colIndex 用于渲染单元格内容
                if (cellEventHandler) {
                    cellEventHandler(cell);
                }
            });
            tbody.appendChild(rowElement); // 将 rowElement 添加到 tbody 中
        });
        return this.element;
    }

    /**
     * 保存表格数据
     * @returns {Sheet|boolean}
     */
    save(targetPiece = USER.getChatPiece(), manualSave = false) {
        const sheetDataToSave = this.filterSavingData()
        sheetDataToSave.template = this.template?.uid;

        let sheets = BASE.sheetsData.context ?? [];
        try {
            if (sheets.some(t => t.uid === sheetDataToSave.uid)) {
                sheets = sheets.map(t => t.uid === sheetDataToSave.uid ? sheetDataToSave : t);
            } else {
                sheets.push(sheetDataToSave);
            }
            BASE.sheetsData.context = sheets;
            if( !targetPiece ){
                console.log("没用消息能承载hash_sheets数据，不予保存")
                return this
            }
            if (!targetPiece.hash_sheets) targetPiece.hash_sheets = {};
            targetPiece.hash_sheets[this.uid] = this.hashSheet?.map(row => row.map(hash => hash));
            console.log('保存表格数据', targetPiece, this.hashSheet);
            if (!manualSave) USER.saveChat();
            return this;
        } catch (e) {
            EDITOR.error(`保存模板失败：${e}`);
            return false;
        }
    }

    /**
     * 创建新的 Sheet 实例
     * @returns {Sheet} - 返回新的 Sheet 实例
     */
    createNewSheet(column = 2, row = 2, isSave = true) {
        this.init(column, row);     // 初始化基本数据结构
        this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
        this.name = `新表格_${this.uid.slice(-4)}`;
        if (isSave) this.save();    // 保存新创建的 Sheet
        return this;                // 返回 Sheet 实例自身
    }

    /**
     * 获取表格内容的提示词，可以通过指定['title', 'node', 'headers', 'rows', 'editRules']中的部分，只获取部分内容
     * @returns 表格内容提示词
     */
    getTableText(index, customParts = ['title', 'node', 'headers', 'rows', 'editRules']) {
        console.log('获取表格内容提示词', this)
        const title = `* ${index}:${this.name}\n`;
        const node = this.source.data.note && this.source.data.note !== '' ? '【说明】' + this.source.data.note + '\n' : '';
        const headers = "rowIndex," + this.getCellsByRowIndex(0).slice(1).map((cell, index) => index + ':' + cell.data.value).join(',') + '\n';
        const rows = this.getSheetCSV()
        const editRules = this.#getTableEditRules() + '\n';

        let result = '';

        if (customParts.includes('title')) {
            result += title;
        }
        if (customParts.includes('node')) {
            result += node;
        }
        if (customParts.includes('headers')) {
            result += '【表格内容】\n' + headers;
        }
        if (customParts.includes('rows')) {
            result += rows;
        }
        if (customParts.includes('editRules')) {
            result += editRules;
        }
        return result;
    }

    /**
     * 获取表格的content数据（与旧版兼容）
     * @returns {string[][]} - 返回表格的content数据
     */
    getContent(withHead = false) {
        if (!withHead&&this.isEmpty()) return [];
        const content = this.hashSheet.map((row) =>
            row.map((cellUid) => {
                const cell = this.cells.get(cellUid);
                if (!cell) return "";
                return cell.data.value;
            })
        );

        // 去掉每一行的第一个元素
        const trimmedContent = content.map(row => row.slice(1));
        if (!withHead) return trimmedContent.slice(1);
        return content;
    }
    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */

    #load(target) {
        if (target === null) {
            return this;
        }
        if (target.domain === this.SheetDomain.global) {
            console.log('从模板转化表格', target, this);
            this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
            this.name = target.name.replace('模板', '表格');
            this.hashSheet = [target.hashSheet[0].map(uid => uid)];
            this.required = target.required;
            this.cellHistory = target.cellHistory.filter(c => this.hashSheet[0].includes(c.uid));
            this.config = {...target.config};
            this.loadCells();
            this.markPositionCacheDirty();
            this.template = target;
            return
        }
        let targetUid = target?.uid || target;
        let targetSheetData = BASE.sheetsData.context?.find(t => t.uid === targetUid);
        if (targetSheetData?.uid) {
            Object.assign(this, filterSavingData(targetSheetData));
            if(target.hashSheet) this.hashSheet =target.hashSheet.map(row => row.map(hash => hash));
            this.loadCells();
            this.markPositionCacheDirty();
            return this;
        }
        console.log(`未找到对应的模板`, target)
        throw new Error('未找到对应的模板');
    }
    /**
     * 获取表格编辑规则提示词
     * @returns
     */
    #getTableEditRules() {
        const source = this.source;
        if (this.required && this.isEmpty()) return '【增删改触发条件】\n插入：' + source.data.initNode + '\n'
        else {
            let editRules = '【增删改触发条件】\n'
            if (source.data.insertNode) editRules += ('插入：' + source.data.insertNode + '\n')
            if (source.data.updateNode) editRules += ('更新：' + source.data.updateNode + '\n')
            if (source.data.deleteNode) editRules += ('删除：' + source.data.deleteNode + '\n')
            return editRules
        }
    }

    /**
     * 初始化hashSheet，只保留表头
     */
    initHashSheet() {
        this.hashSheet = [this.hashSheet[0].map(uid => uid)];
        this.markPositionCacheDirty();
    }
}
