# 技術規格書 (Technical Specification)

## 技術堆疊 (Tech Stack)

### 核心框架
- **Runtime**: Node.js (VS Code Extension Host)
- **Language**: TypeScript
- **UI Framework**: React (Webview)

### 關鍵函式庫
1.  **React Flow** (`reactflow`):
    - 用於渲染節點與連線的圖形介面。
    - 處理所有的幾何運算、縮放、平移與拖曳事件。
2.  **Fast XML Parser** (`fast-xml-parser`):
    - 負責 SCXML 檔案的解析與生成。
    - 配置為保留屬性前綴與 CDATA，確保與原始格式的相容性。

## 架構設計

### 系統架構圖
```mermaid
graph TD
    A[VS Code Extension Host] <-->|Message Passing| B[Webview (React App)];
    A <-->|File I/O| C[File System (.scxml)];
    B <-->|Render| D[React Flow Canvas];
    
    subgraph Extension Logic
    E[SCXML Parser]
    F[Document Manager]
    end
    
    A --- E
    A --- F
```

### 資料流 (Data Flow)
1.  **讀取 (Read)**:
    - Extension 讀取 `.scxml` 檔案內容。
    - `ScxmlParser` 將 XML 轉換為 JSON 對象，並提取 `qt:editorinfo` 中的座標。
    - 將結構化數據 (Nodes/Edges) 傳遞給 Webview。
2.  **渲染 (Render)**:
    - Webview 接收消息，React Flow 根據數據渲染圖形。
3.  **更新 (Update)**:
    - 使用者在 Webview 中操作（如移動節點）。
    - Webview 發送 `updateNode` 消息回 Extension。
    - Extension 接收消息，更新內存中的 JSON 對象結構。
4.  **寫回 (Write)**:
    - 使用者觸發保存 (Save) 或自動同步。
    - `ScxmlParser` 將更新後的 JSON 轉換回 XML 字符串。
    - 寫入檔案系統。

## 開發環境設置

### 必要條件
- Node.js (v16.x 或更高)
- npm
- VS Code (建議最新版)

### 安裝步驟
1.  **Clone 專案**:
    ```bash
    git clone <repository-url>
    cd scxml-extension
    ```
2.  **安裝依賴**:
    ```bash
    npm install
    ```
3.  **編譯**:
    ```bash
    npm run compile
    ```

### 偵錯與測試
- **啟動偵錯**: 在 VS Code 中按下 `F5` 啟動 Extension Development Host。
- **Parser 測試**: 運行獨立測試腳本驗證解析邏輯。
    ```bash
    npx ts-node src/test-parser.ts
    ```
