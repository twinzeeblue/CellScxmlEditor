# Cell SCXML Editor ROADMAP

本文檔記錄了 Cell SCXML Editor 的開發歷程與未來功能路徑。

## 已完成里程碑 (Completed)

### Phase 1：基礎架構與核心解析
- [x] 建立 VS Code Extension 專案結構。
- [x] 實作 SCXML Parser，支援解析並結構化狀態節點與過渡事件。
- [x] 成功提取 `qt:editorinfo` 中的幾何資訊。
- [x] 建立 Webview 基礎框架。

### Phase 2：視覺化渲染整合
- [x] 整合 React Flow 庫進行圖形渲染。
- [x] 實現從 SCXML 階層轉化為 React Flow 的 Nodes/Edges 模型。
- [x] 在圖形介面中還原原始座標佈局。
- [x] 支援基本的縮放、平移與拖曳互動。

### Phase 3：雙向同步與寫回
- [x] 實作 `ScxmlParser.stringify()`，支援將 JSON 結構轉回標準 XML。
- [x] 整合 Webview 訊息監聽，實現節點移動後的自動更新功能。
- [x] 驗證生成的 XML 符合原有 Qt 編輯器規範。
- [x] 整理開發報告與使用手冊。

## 未來計畫 (Future Plans)

### Phase 4：邏輯與屬性編輯 (In Planning)
- [ ] **屬性側邊欄**：選取節點時顯示側邊欄，編輯 `id`, `name`, `initial` 等屬性。
- [ ] **邏輯代碼編輯**：整合 Monaco Editor 於屬性面板，直接編輯 `onentry`, `onexit` 與 `script`。
- [ ] **連線編輯**：支援在圖形中直接拖拽連線以修改 `transition` 目標。

### Phase 5：Antigravity AI 代理集成
- [ ] **AI 輔助建模**：透過自然語言指令生成狀態機片段。
- [ ] **邏輯分析報告**：AI 自動掃描連線錯誤、死鎖或不可觸達狀態。
- [ ] **智慧自動排版**：利用 AI 或進階算法自動調整複雜狀態機的視覺佈局。

### Phase 6：生產環境優化
- [ ] 支援多文件編輯與跳轉。
- [ ] 整合 Git 差異對比，查看狀態機的變動歷史。
- [ ] 提供精美預設主題（Dark/Light Mode）。
- [ ] **Auto Layout 優化**：自動排版時保留使用者的當前縮放比例 (Zoom Level)，僅調整視圖中心。
- [ ] **縮圖導航增強**：點擊縮圖 (MiniMap) 上的節點時，將畫布置中於該節點，並保留當前縮放比例。

### 座標系統一致性檢核 (Coordinate System Review) - *2025-12-27*
根據 README.md 之描述與實際程式碼 (extension.ts) 進行比對：
1.  **畫布座標 (Canvas Cursor)**：
    -   **一致**。程式碼中使用 `clientX/Y` 減去容器 `rect.left/top` 計算，確實代表游標在當前畫布視圖中的相對位置。
2.  **圖像座標 (Diagram Cursor)**：
    -   **一致 (已修正)**。
    -   README 定義為「以圖表內容的左上角 (0,0) 為基準」。
    -   實際實作 (Line 420-430) 已修正為將圖形最左上角元素對齊至 `(0, 0)` 位置。

---
### 座標系統與導航優化 (Coordinate System & Navigation) - *2025-12-27*
針對巢狀結構 (Nested Structures) 進行了深度的座標邏輯修正，確保編輯器能精確反映 SCXML 狀態機的空間關係。

1.  **絕對座標 (Absolute Position) 實作**：
    -   實作了遞迴計算邏輯 `getAbsPos`，能正確累加父節點座標，得出 State 的世界絕對座標。
    -   針對 Transition，計算 Source/Target 的絕對座標中點，解決了相對座標導致的連線定位誤差。

2.  **屬性面板增強**：
    -   新增 `Absolute Position` 欄位，與 `Layout Position (Relative)` 並列，提供更完整的空間資訊。
    -   新增 `Diagram Size` 顯示，計算涵蓋所有巢狀節點的全域邊界框尺寸。

3.  **智慧導航 (Smart Focus)**：
    -   修正了屬性面板點擊關聯項目（State ↔ Transition）時的視圖行為。
    -   現在使用 Absolute Position 進行 `setCenter`，確保視窗能精準平滑地移動到目標物件的視覺中心，即使該物件位於深層巢狀結構中。

---
*Last Updated: 2025-12-27*
