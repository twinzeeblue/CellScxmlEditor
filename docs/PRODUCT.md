# 產品規格書 (Product Specification)

## 產品名稱
Cell SCXML Editor

## 產品概述
這是一個專為 Cell Apps 專案量身打造的 VS Code 擴充套件，提供圖形化的狀態機編輯介面。它解決了傳統文字編輯 SCXML 的直觀性不足問題，同時保持與 Qt-based 編輯器的相容性。

## 核心價值
1.  **直觀可視化**：透過圖形介面不僅能快速理解複雜的狀態流轉，更能有效降低維護成本。
2.  **無縫整合**：直接在 VS Code 開發環境中運作，無需切換至外部工具。
3.  **高度相容**：完美支援並保留 `qt:editorinfo` 幾何數據，確保與 CellApps 現有工作流無縫接軌。

## 主要功能

### 1. 視覺化編輯器
- **基於 React Flow**：提供現代化、流暢的圖形操作體驗。
- **階層式展示**：清晰呈現狀態機的階層結構（State, Compound State, Parallel State）。
- **互動操作**：支援縮放 (Zoom)、平移 (Pan) 以及節點拖曳 (Drag)。

### 2. 數據同步與保存
- **佈局還原**：自動讀取 SCXML 中的 `qt:editorinfo`，還原節點座標與尺寸。
- **雙向同步**：圖形介面的變更（如移動節點）即時寫回 `.scxml` 檔案。
- **非破壞性編輯**：僅修改幾何與結構資訊，嚴格保留 `script`, `assign`, `transition` 等業務邏輯代碼。

### 3. 開發者體驗
- **VS Code 整合**：右鍵點擊 `.scxml` 檔案即可開啟 "Open SCXML Visual Editor"。
- **macOS 優化**：支援觸控板手勢 (Pinch to Zoom, Scroll to Pan) 與 Retina 高解析度渲染。

## Antigravity Agent 整合
本產品專為 Antigravity AI Agent 環境優化，支援以下協作模式：
- **上下文感知**：Agent 能識別當前選取的節點與連線。
- **自然語言指令**：使用者可透過對話要求 Agent 修改排版（例如：「將 NormalGame 節點向右移」）。
- **智慧建議**：Agent 可根據上下文輔助生成 `transition` 條件或狀態邏輯。

## 目標用戶
- Cell Apps 專案開發人員
- 需要維護複雜 SCXML 狀態機的工程師
