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
- [x] **座標系統一致性檢核 (2025-12-27)**：
    - 畫布座標 (Canvas Cursor)：使用 `clientX/Y` 減去容器偏移，代表當前視圖位置。
    - 圖像座標 (Diagram Cursor)：以圖表內容左上角 (0,0) 為基準，完成對齊修正。
- [x] **座標系統與導航優化 (2025-12-27)**：
    - 實作絕對座標 (`getAbsPos`) 遞迴計算，解決巢狀結構下的連線定位誤差。
    - 屬性面板新增世界座標與 Diagram Size 顯示。
    - 智慧導航 (Smart Focus)：使用絕對座標進行 `setCenter`，精確定位巢狀節點。

### Phase 3：雙向同步與寫回
- [x] 實作 `ScxmlParser.stringify()`，支援將 JSON 結構轉回標準 XML。
- [x] 整合 Webview 訊息監聽，實現節點移動後的自動更新功能。
- [x] 驗證生成的 XML 符合原有 Qt 編輯器規範。
- [x] 整理開發報告與使用手冊。

### Phase 4：Compound States 視覺化支援
- [x] **群組渲染 (Group Rendering)**：巢狀狀態 (Nested States) 在視覺上呈現為群組容器，並正確包裹其子節點。
- [x] **層級座標系統**：優化座標解析，確保巢狀節點相對於父節點的幾何資訊能精確還原。
- [x] **互動式收摺**：支援點擊父狀態以收摺/展開其子狀態，優化複雜狀態機的閱讀體驗。
- [x] **邊界自動擴充**：當子節點移動時，自動調整父節點的尺寸以維持包含關係。
- [x] **階層式自動排版**：優化 Dagre 佈局引擎，支援 Compound Graph 的自動排列與父容器尺寸計算。
- [x] **畫布與縮圖同步**：統一幾何計算邏輯，修正 CSS 物理偏移，實現 Canvas 與 MiniMap 的精準同步。

## 未來計畫 (Future Plans)

### Phase 5：邏輯與屬性編輯 (In Planning)
- [ ] **屬性側邊欄**：選取節點時顯示側邊欄，編輯 `id`, `name`, `initial` 等屬性。
- [ ] **邏輯代碼編輯**：整合 Monaco Editor 於屬性面板，直接編輯 `onentry`, `onexit` 與 `script`。
- [ ] **連線編輯**：支援在圖形中直接拖拽連線以修改 `transition` 目標。

### Phase 6：Antigravity AI 代理集成
- [ ] **AI 輔助建模**：透過自然語言指令生成狀態機片段。
- [ ] **邏輯分析報告**：AI 自動掃描連線錯誤、死鎖或不可觸達狀態。
- [ ] **智慧自動排版**：利用 AI 或進階算法自動調整複雜狀態機的視覺佈局。

### Phase 7：生產環境優化
- [ ] 支援多文件編輯與跳轉。
- [ ] 整合 Git 差異對比，查看狀態機的變動歷史。
- [ ] 提供精美預設主題（Dark/Light Mode）。
- [ ] **Auto Layout 優化**：自動排版時保留使用者的當前縮放比例 (Zoom Level)，僅調整視圖中心。
- [ ] **縮圖導航增強**：點擊縮圖 (MiniMap) 上的節點時，將畫布置中於該節點，並保留當前縮放比例。

---
*Last Updated: 2025-12-28*
