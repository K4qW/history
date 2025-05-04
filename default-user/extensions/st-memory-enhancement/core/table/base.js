// base.js
import {Cell} from "./cell.js";
import {filterSavingData} from "./utils.js";

const SheetDomain = {
    global: 'global',
    role: 'role',
    chat: 'chat',
}
const SheetType = {
    free: 'free',
    dynamic: 'dynamic',
    fixed: 'fixed',
    static: 'static',
}
const customStyleConfig = {
    mode: 'regex',
    basedOn: 'html',
    regex: '/(^[\\s\\S]*$)/g',
    replace: `$1`,
}

export class SheetBase {
    SheetDomain = SheetDomain;
    SheetType = SheetType;

    constructor() {
        // 以下为基本属性
        this.uid = '';
        this.name = '';
        this.domain = '';
        this.type = SheetType.dynamic;
        this.enable = true;                     // 用于标记是否启用
        this.required = false;                  // 用于标记是否必填
        this.tochat = true;                     // 用于标记是否发送到聊天

        // 以下为持久化数据
        this.cellHistory = [];                  // cellHistory 持久保持，只增不减
        this.hashSheet = [];                    // 每回合的 hashSheet 结构，用于渲染出表格

        this.config = {
            // 以下为其他的属性
            toChat: true,                     // 用于标记是否发送到聊天
            useCustomStyle: false,            // 用于标记是否使用自定义样式
            selectedCustomStyleKey: '',       // 用于存储选中的自定义样式，当selectedCustomStyleUid没有值时，使用默认样式
            customStyles: {'自定义样式': {...customStyleConfig}},                 // 用于存储自定义样式
        }


        // 以下为派生数据
        this.cells = new Map();                 // cells 在每次 Sheet 初始化时从 cellHistory 加载
        this.data = new Proxy({}, {     // 用于存储用户自定义的表格数据
            get: (target, prop) => {
                return this.source.data[prop];
            },
            set: (target, prop, value) => {
                this.source.data[prop] = value;
                return true;
            },
        });
        this._cellPositionCacheDirty = true;    // 用于标记是否需要重新计算 sheetCellPosition
        this.positionCache = new Proxy(new Map(), {
            get: (map, uid) => {
                if (this._cellPositionCacheDirty) {
                    map.clear();
                    this.hashSheet.forEach((row, rowIndex) => {
                        row.forEach((cellUid, colIndex) => {
                            map.set(cellUid, [rowIndex, colIndex]);
                        });
                    });
                    this._cellPositionCacheDirty = false;   // 更新完成，标记为干净
                    console.log('重新计算 positionCache: ', map);
                }
                return map.get(uid);
            },
        });
    }
    get source() {
        return this.cells.get(this.hashSheet[0][0]);
    }

    markPositionCacheDirty() {
        this._cellPositionCacheDirty = true;
        // console.log(`标记 Sheet: ${this.name} (${this.uid}) 的 positionCache 为脏`);
    }

    init(column = 2, row = 2) {
        this.cells = new Map();
        this.cellHistory = [];
        this.hashSheet = [];

        // 初始化 hashSheet 结构
        const r = Array.from({ length: row }, (_, i) => Array.from({ length: column }, (_, j) => {
            let cell = new Cell(this);
            this.cells.set(cell.uid, cell);
            this.cellHistory.push(cell);
            if (i === 0 && j === 0) {
                cell.type = cell.CellType.sheet_origin;
            } else if (i === 0) {
                cell.type = cell.CellType.column_header;
            } else if (j === 0) {
                cell.type = cell.CellType.row_header;
            }
            return cell.uid;
        }));
        this.hashSheet = r;

        return this;
    };

    rebuildHashSheetByValueSheet(valueSheet) {
        const cols = valueSheet[0].length
        const rows = valueSheet.length
        const newHashSheet = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => {
            const cell = new Cell(this);
            this.cells.set(cell.uid, cell);
            this.cellHistory.push(cell);
            cell.data.value = valueSheet[i][j] || ''; // 设置单元格的值
            if (i === 0 && j === 0) {
                cell.type = cell.CellType.sheet_origin;
            } else if (i === 0) {
                cell.type = cell.CellType.column_header;
            } else if (j === 0) {
                cell.type = cell.CellType.row_header;
            }
            return cell.uid;
        }));
        this.hashSheet = newHashSheet
        return this
    }

    loadCells() {
        // 从 cellHistory 遍历加载 Cell 对象
        try {
            this.cells = new Map(); // 初始化 cells Map
            this.cellHistory?.forEach(c => { // 从 cellHistory 加载 Cell 对象
                const cell = new Cell(this);
                Object.assign(cell, c);
                this.cells.set(cell.uid, cell);
            });
        } catch (e) {
            console.error(`加载失败：${e}`);
            return false;
        }

        // 加载后，根据 hashSheet 结构重新初始化所有 Cell
        try {
            if (this.hashSheet && this.hashSheet.length > 0) {
                // 如果 hashSheet 只有一行，说明没有数据，只初始化表头行
                if (this.hashSheet.length === 1) {
                    this.hashSheet[0].forEach(hash => {
                        const cell = this.cells.get(hash);
                        this.cells.set(cell.uid, cell);
                    });
                }
                // 如果 hashSheet 有数据，遍历 hashSheet，初始化每一个 Cell
                this.hashSheet.forEach((rowUids, rowIndex) => {
                    rowUids.forEach((cellUid, colIndex) => {
                        const cell = this.cells.get(cellUid);
                        if (cell) {
                            if (rowIndex === 0 && colIndex === 0) {
                                cell.type = cell.CellType.sheet_origin;
                            } else if (rowIndex === 0) {
                                cell.type = cell.CellType.column_header;
                            } else if (colIndex === 0) {
                                cell.type = cell.CellType.row_header;
                            } else {
                                cell.type = cell.CellType.cell; // 默认单元格类型
                            }
                        }
                    });
                });
            }
        } catch (e) {
            console.error(`加载失败：${e}`);
            return false;
        }
    }

    findCellByValue(value) {
        const cell = this.cellHistory.find(cell => cell.data.value === value);
        if (!cell) {
            return null;
        }
        return cell;
    }

    findCellByPosition(rowIndex, colIndex) {
        if (rowIndex < 0 || colIndex < 0 || rowIndex >= this.hashSheet.length || colIndex >= this.hashSheet[0].length) {
            console.warn('无效的行列索引');
            return null;
        }
        const hash = this.hashSheet[rowIndex][colIndex]
        const target = this.cells.get(hash) || null;
        if (!target) {
            console.warn(`未找到单元格 ${rowIndex} ${colIndex} ${hash}`);
            return null;
        }
        return target;
    }
    /**
     * 通过行号获取行的所有单元格
     * @param {number} rowIndex
     * @returns cell[]
     */
    getCellsByRowIndex(rowIndex) {
        if (rowIndex < 0 || rowIndex >= this.hashSheet.length) {
            console.warn('无效的行索引');
            return null;
        }
        return this.hashSheet[rowIndex].map(uid => this.cells.get(uid));
    }
    /**
     * 获取表格csv格式的内容
     * @returns
     */
    getSheetCSV( removeHeader = true,key = 'value') {
        if (this.isEmpty()) return '（此表格当前为空）\n'
        console.log("测试获取map", this.cells)
        const content = this.hashSheet.slice(removeHeader?1:0).map((row, index) => row.map(cellUid => {
            const cell = this.cells.get(cellUid)
            if (!cell) return ""
            return cell.type === cell.CellType.row_header ? index : cell.data[key]
        }).join(',')).join('\n');
        return content + "\n";
    }
    /**
     * 表格是否为空
     * @returns 是否为空
     */
    isEmpty() {
        return this.hashSheet.length <= 1;
    }

    filterSavingData() {
        return filterSavingData(this)
    }

    getRowCount() {
        return this.hashSheet.length;
    }

    /**
     * 获取表头数组（兼容旧数据）
     * @returns {string[]} 表头数组
     */
    getHeader() {
        const header = this.hashSheet[0].slice(1).map(cellUid => {
            const cell = this.cells.get(cellUid);
            return cell ? cell.data.value : '';
        });
        return header;
    }
}
