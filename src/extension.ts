import * as vscode from 'vscode';
import * as fs from 'fs';
import { ScxmlParser } from './scxml-parser';

export function activate(context: vscode.ExtensionContext) {
    console.log('CellApps SCXML Visual Editor is now active!');

    let disposable = vscode.commands.registerCommand('scxml-editor.openVisualEditor', (uri: vscode.Uri) => {
        if (!uri) {
            vscode.window.showErrorMessage('Please select an SCXML file from the explorer.');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'scxmlVisualEditor',
            `SCXML Editor: ${uri.fsPath.split('/').pop()}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        const scxmlContent = fs.readFileSync(uri.fsPath, 'utf8');
        const parser = new ScxmlParser();
        const scxmlData = parser.parse(scxmlContent);
        const flowData = parser.toReactFlow(scxmlData);

        panel.webview.html = getWebviewContent();

        // 確保 Webview 載入完成後發送初始資料
        setTimeout(() => {
            panel.webview.postMessage({ command: 'init', data: flowData });
        }, 1000);

        // 監聽來自 Webview 的訊息
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'update':
                        const updatedScxmlData = parser.updateFromFlow(scxmlData, message.nodes, message.edges);
                        const newXml = parser.stringify(updatedScxmlData);
                        fs.writeFileSync(uri.fsPath, newXml, 'utf8');
                        return;
                    case 'alert':
                        vscode.window.showInformationMessage(message.text);
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; script-src 'unsafe-inline' https://cdn.tailwindcss.com https://esm.sh; style-src 'unsafe-inline' https://esm.sh; connect-src https://esm.sh;">
    <title>SCXML Visual Editor</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://esm.sh/reactflow@11.10.1/dist/style.css">
    <script>const vscode = acquireVsCodeApi();</script>
    <style>
        html, body, #root { height: 100%; margin: 0; padding: 0; background: #121212; color: #fff; overflow: hidden; }
        /* 徹底移除 React Flow 預設背景與邊框 */
        .react-flow__node {
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
        }
        .react-flow__node-state, 
        .react-flow__node-parallel, 
        .react-flow__node-final {
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
        }
        .scxml-node { 
            border-radius: 12px; 
            font-size: 13px;
            transition: all 0.2s ease;
            position: relative;
            background: transparent !important;
        }
        .scxml-state { border-style: solid; }
        .scxml-parallel { border-style: dashed; }
        .scxml-final { border-style: double; }
        #loading { display: flex; justify-content: center; align-items: center; height: 100%; font-size: 1.2em; color: #718096; }
        #error-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); color: #ff5555; padding: 20px; display: none; z-index: 9999; }
    </style>
</head>
<body>
    <div id="root">
        <div id="loading">Loading SCXML Data...</div>
    </div>
    <div id="error-overlay">
        <h2>Renderer Error</h2>
        <pre id="error-content"></pre>
    </div>
    
    <script type="importmap">
    {
        "imports": {
            "react": "https://esm.sh/react@18.2.0",
            "react-dom": "https://esm.sh/react-dom@18.2.0",
            "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
            "reactflow": "https://esm.sh/reactflow@11.10.1?external=react,react-dom",
            "dagre": "https://esm.sh/dagre@0.8.5"
        }
    }
    </script>

    <script type="module">
        import React, { useState, useCallback, useEffect, useMemo } from 'react';
        import { createRoot } from 'react-dom/client';
        import ReactFlow, { 
            Background, 
            Controls, 
            MiniMap,
            applyEdgeChanges, 
            applyNodeChanges,
            Panel,
            Handle,
            Position,
            useReactFlow,
            ReactFlowProvider
        } from 'reactflow';
        import dagre from 'dagre';

        // 自定義 SCXML 節點組件，支援多 Handle
        // 自定義 SCXML 節點組件，支援多 Handle
        const ScxmlNode = ({ data, id }) => {
            const sources = Array.from({ length: (data && data.sourceCount) || 0 }, (_, i) => i + 1);
            const targets = Array.from({ length: (data && data.targetCount) || 0 }, (_, i) => i + 1);
            const borderColor = (data && data.borderColor) || '#4299e1';

            const nodeStyle = {
                border: '2px solid ' + borderColor,
                borderColor: borderColor,
                borderWidth: '2px',
                background: 'rgba(0,0,0,0)',
                backgroundColor: 'rgba(0,0,0,0)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 0 20px ' + borderColor + '44',
                color: borderColor,
                padding: '16px',
                borderRadius: '12px',
                minWidth: '180px',
                overflow: 'visible'
            };

            return React.createElement('div', { 
                className: "scxml-node scxml-" + (data && data.type || 'state'),
                style: nodeStyle
            },
                // 入點 Handles (頂部)
                targets.map(i => React.createElement(Handle, {
                    key: 't-' + i,
                    type: 'target',
                    position: Position.Top,
                    id: 't-' + i,
                    style: { left: ((i / (targets.length + 1)) * 100) + "%", background: borderColor, border: '1px solid #fff' }
                })),
                
                // 節點內容
                React.createElement('div', { 
                    className: 'font-bold text-center truncate pointer-events-none',
                    style: { 
                        color: borderColor, 
                        fontSize: '14px',
                        letterSpacing: '0.5px',
                        textShadow: '0 0 10px ' + borderColor + '44' 
                    }
                }, data && data.label),
                
                // 出點 Handles (底部)
                sources.map(i => React.createElement(Handle, {
                    key: 's-' + i,
                    type: 'source',
                    position: Position.Bottom,
                    id: 's-' + i,
                    style: { left: ((i / (sources.length + 1)) * 100) + "%", background: borderColor, border: '1px solid #fff' }
                }))
            );
        };

        const nodeTypes = {
            state: ScxmlNode,
            parallel: ScxmlNode,
            final: ScxmlNode
        };

        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        const defaultNodeWidth = 200;
        const defaultNodeHeight = 50;

        const getLayoutedElements = (nodes, edges, direction = 'TB') => {
            dagreGraph.setGraph({ 
                rankdir: direction,
                nodesep: 50,      // 進一步減少水平間距（原 80）
                ranksep: 60,      // 進一步減少垂直間距（原 100）
                marginx: 30,      // 減少邊距（原 50）
                marginy: 30,      // 減少邊距（原 50）
                ranker: 'network-simplex',
                edgesep: 5        // 進一步減少邊緣間距（原 10）
            });

            nodes.forEach((node) => {
                // 優先使用節點原本的寬高，否則使用預設值
                const w = node.width || node.style?.width || defaultNodeWidth;
                const h = node.height || node.style?.height || defaultNodeHeight;
                dagreGraph.setNode(node.id, { width: w, height: h });
            });

            edges.forEach((edge) => {
                dagreGraph.setEdge(edge.source, edge.target);
            });

            dagre.layout(dagreGraph);

            nodes.forEach((node) => {
                const nodeWithPosition = dagreGraph.node(node.id);
                const w = node.width || node.style?.width || defaultNodeWidth;
                const h = node.height || node.style?.height || defaultNodeHeight;
                
                // Dagre 的座標是中心點，React Flow 是左上角
                node.position = {
                    x: nodeWithPosition.x - w / 2,
                    y: nodeWithPosition.y - h / 2,
                };
            });

            return { nodes, edges };
        };

        window.onerror = function(msg, url, line, col, error) {
            const overlay = document.getElementById('error-overlay');
            const content = document.getElementById('error-content');
            overlay.style.display = 'block';
            content.textContent = msg + (error ? '\\n' + error.stack : '');
        };

        const rootElement = document.getElementById('root');
        const root = createRoot(rootElement);

        function Editor({ initialData }) {
            const [nodes, setNodes] = useState(initialData?.nodes || []);
            const [edges, setEdges] = useState(initialData?.edges || []);
            const [selectedElement, setSelectedElement] = useState(null);
            const flowWrapperRef = useState({ focusElement: null })[0];
            const reactFlowInstance = useReactFlow();

            // 當 nodes 或 edges 變更時（如拖曳、Layout），同步更新當前選取的元素數據
            useEffect(() => {
                if (!selectedElement) return;

                if (selectedElement.type === 'node') {
                    const currentNode = nodes.find(n => n.id === selectedElement.data.id);
                    if (currentNode && currentNode !== selectedElement.data) {
                        setSelectedElement(prev => ({ ...prev, data: currentNode }));
                    }
                } else if (selectedElement.type === 'edge') {
                    const currentEdge = edges.find(e => e.id === selectedElement.data.id);
                    if (currentEdge && currentEdge !== selectedElement.data) {
                        setSelectedElement(prev => ({ ...prev, data: currentEdge }));
                    }
                }
            }, [nodes, edges, selectedElement]);

            // 處理自循環邊的層級和標籤位置，並為所有邊添加座標
            const processedEdges = useMemo(() => {
                return edges.map(edge => {
                    // 找到 source 和 target 節點以計算中點座標
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    const targetNode = nodes.find(n => n.id === edge.target);
                    
                    let coordLabel = '';
                    if (sourceNode && targetNode && edge.source !== edge.target) {
                        const sx = sourceNode.position.x + (sourceNode.width || 200) / 2;
                        const sy = sourceNode.position.y + (sourceNode.height || 50) / 2;
                        const tx = targetNode.position.x + (targetNode.width || 200) / 2;
                        const ty = targetNode.position.y + (targetNode.height || 50) / 2;
                        const centerX = Math.round((sx + tx) / 2);
                        const centerY = Math.round((sy + ty) / 2);
                        coordLabel = ' (' + centerX + ', ' + centerY + ')';
                    }
                    
                    if (edge.source === edge.target) {
                        // 自循環邊：提高 z-index 並偏移標籤位置以避免與 state 名稱重疊
                        return {
                            ...edge,
                            zIndex: 1000,
                            style: {
                                ...edge.style,
                                zIndex: 1000
                            },
                            labelStyle: {
                                ...edge.labelStyle,
                                transform: 'translateY(60px)'
                            },
                            labelBgStyle: {
                                ...edge.labelBgStyle,
                                transform: 'translateY(60px)'
                            }
                        };
                    }
                    // 非自循環邊：添加座標到標籤
                    const newLabel = (edge.data?.label || edge.label || '') + coordLabel;
                    return {
                        ...edge,
                        label: newLabel,
                        data: {
                            ...edge.data,
                            label: newLabel
                        }
                    };
                });
            }, [edges, nodes]);

            // 為 State 節點添加座標到標籤，並同步實際測量尺寸
            const processedNodes = useMemo(() => {
                return nodes.map(node => {
                    // 優先使用測量後的尺寸，確保 MiniMap 顯示正確
                    const measuredWidth = node.measured?.width || node.width;
                    const measuredHeight = node.measured?.height || node.height;
                    const w = measuredWidth || 200;
                    const h = measuredHeight || 50;
                    const centerX = Math.round(node.position.x + w / 2);
                    const centerY = Math.round(node.position.y + h / 2);
                    const coordLabel = ' (' + centerX + ', ' + centerY + ')';
                    
                    return {
                        ...node,
                        // 同步測量尺寸到直接屬性，供 MiniMap 使用
                        width: w,
                        height: h,
                        style: {
                            ...node.style,
                            width: w,
                            height: h
                        },
                        data: {
                            ...node.data,
                            label: (node.data?.label || node.id || '').replace(/\s*\(\d+,\s*\d+\)$/, '') + coordLabel
                        }
                    };
                });
            }, [nodes]);


            const onNodesChange = useCallback(
                (changes) => setNodes((nds) => {
                    const updatedNodes = applyNodeChanges(changes, nds);
                    // 僅在 React Flow 提供實際測量尺寸 (measured) 時才同步到 width/height 屬性
                    // 這能解決 MiniMap 讀取錯誤尺寸的問題
                    return updatedNodes.map((node) => {
                        if (node.measured && (node.width !== node.measured.width || node.height !== node.measured.height)) {
                            return {
                                ...node,
                                width: node.measured.width,
                                height: node.measured.height,
                                style: {
                                    ...node.style,
                                    width: node.measured.width,
                                    height: node.measured.height
                                }
                            };
                        }
                        return node;
                    });
                }),
                []
            );
            const onEdgesChange = useCallback(
                (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
                []
            );

            // 處理選取事件
            const onNodeClick = useCallback((event, node) => {
                setSelectedElement({ type: 'node', data: node });
            }, []);

            const onEdgeClick = useCallback((event, edge) => {
                setSelectedElement({ type: 'edge', data: edge });
                if (flowWrapperRef.focusElement) {
                    flowWrapperRef.focusElement({ ...edge, type: 'edge' });
                }
            }, []);

            const onPaneClick = useCallback(() => {
                setSelectedElement(null);
            }, []);

            // 處理欄位變動
            const onInputChange = (key, value) => {
                if (!selectedElement) return;

                if (selectedElement.type === 'node') {
                    setNodes(nds => nds.map(n => {
                        if (n.id === selectedElement.data.id) {
                            const newNode = { ...n, data: { ...n.data, [key]: value } };
                            if (key === 'label') newNode.data.label = value; // 同步標籤
                            return newNode;
                        }
                        return n;
                    }));
                } else {
                    setEdges(eds => eds.map(e => {
                        if (e.id === selectedElement.data.id) {
                            return { ...e, [key]: value };
                        }
                        return e;
                    }));
                }
                
                // 更新當前選取的顯示資料
                setSelectedElement(prev => ({
                    ...prev,
                    data: { ...prev.data, [key]: value }
                }));
            };

            // 使用 ref 來儲存最新的節點位置，避免 React 狀態更新不及時的問題
            const nodePositionsCache = React.useRef(new Map());

            const onLayout = useCallback(
                (direction, preserveZoom = false) => {
                    // 先進行深拷貝，避免 Mutation 問題
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                        nodes,
                        edges,
                        direction
                    );
                    
                    const clonedNodes = JSON.parse(JSON.stringify(layoutedNodes));
                    const clonedEdges = JSON.parse(JSON.stringify(layoutedEdges));
                    
                    // 確保 style 屬性包含正確的尺寸（JSON 序列化後需要重新確認）
                    clonedNodes.forEach(node => {
                        if (node.width && node.height) {
                            if (!node.style) {
                                node.style = {};
                            }
                            node.style.width = node.width;
                            node.style.height = node.height;
                        }
                    });
                    
                    // 正規化座標：讓圖形中心對齊 (0, 0)
                    if (clonedNodes.length > 0) {
                        let minX = Infinity, minY = Infinity;
                        let maxX = -Infinity, maxY = -Infinity;
                        
                        clonedNodes.forEach(node => {
                            const x = node.position.x;
                            const y = node.position.y;
                            const w = node.width || 200;
                            const h = node.height || 50;
                            
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x + w);
                            maxY = Math.max(maxY, y + h);
                        });
                        
                        console.log('Layout Normalization Stats:', JSON.stringify({ minX, minY, maxX, maxY }));
                        
                        // 計算偏移量，讓整體圖形的左上角從 (0, 0) 開始
                        const offsetX = minX;
                        const offsetY = minY;
                        
                        clonedNodes.forEach(node => {
                            node.position.x -= offsetX;
                            node.position.y -= offsetY;
                            
                            // 強制更新位置緩存
                            nodePositionsCache.current.set(node.id, { ...node });
                        });
                    }
                    
                    setNodes(clonedNodes);
                    setEdges(clonedEdges);
                    
                    // 佈局完成後自動將視圖置中並更新邊界
                    // 使用 requestAnimationFrame 確保 React 渲染週期完成 (雙重 rAF 以確保進入下一幀)
                    window.requestAnimationFrame(() => {
                        window.requestAnimationFrame(() => {
                            if (flowWrapperRef.updateBounds) {
                                flowWrapperRef.updateBounds();
                            }
                            if (flowWrapperRef.doFitView) {
                                flowWrapperRef.doFitView({ preserveZoom });
                            }
                        });
                    });
                },
                [nodes, edges, flowWrapperRef]
            );

            // 移除舊的緩存初始化邏輯，改為使用 onLayout 自動初始化
            useEffect(() => {
                const timer = setTimeout(() => {
                    if (nodes.length > 0 || edges.length > 0) {
                        vscode.postMessage({ command: 'update', nodes, edges });
                    }
                }, 1000);
                return () => clearTimeout(timer);
            }, [nodes, edges]);

            // 組件掛載時執行一次初始化布局
            const [hasInitialized, setHasInitialized] = React.useState(false);
            useEffect(() => {
                if (nodes.length > 0 && !hasInitialized) {
                     setHasInitialized(true);
                     // 延遲一點執行，確保 React Flow 已準備好
                     setTimeout(() => {
                         onLayout('TB');
                     }, 100);
                }
            }, [nodes.length, hasInitialized]); // 只在節點數量變化且未初始化時執行

            function FlowController({ flowWrapperRef }) {
                const { setCenter, getNodes, fitView, getEdge, getViewport, setViewport, project, screenToFlowPosition } = useReactFlow();
                const [bounds, setBounds] = useState(null);
                
                // 座標顯示狀態
                const [cursorInfo, setCursorInfo] = useState({ cx: 0, cy: 0, vx: 0, vy: 0, dx: 0, dy: 0, vw: 0, vh: 0 });
                const lastMouseRef = React.useRef({ x: 0, y: 0 });

                useEffect(() => {
                    const update = () => {
                        const { x, y } = lastMouseRef.current;
                        const flowElement = document.querySelector('.react-flow');
                        if (!flowElement) return;
                        
                        const rect = flowElement.getBoundingClientRect();
                        
                        // 1. 視口尺寸與中心 (像素座標)
                        const vw = rect.width;
                        const vh = rect.height;
                        const cx = vw / 2;
                        const cy = vh / 2;
                        
                        // 2. 視口光標 (相對容器像素)
                        const vx = Math.round(x - rect.left);
                        const vy = Math.round(y - rect.top);
                        
                        // 3. 圖紙光標 (圖紙座標)
                        const dPos = screenToFlowPosition
                            ? screenToFlowPosition({ x, y })
                            : project({ x: vx, y: vy });
                        
                        setCursorInfo({
                            cx: Math.round(cx), cy: Math.round(cy),
                            vx, vy,
                            dx: Math.round(dPos.x), dy: Math.round(dPos.y),
                            vw: Math.round(vw), vh: Math.round(vh)
                        });
                    };

                    const onMouseMove = (e) => {
                        lastMouseRef.current = { x: e.clientX, y: e.clientY };
                        update();
                    };
                    
                    const onWheel = () => {
                        // 滾輪縮放會改變中心點和圖紙座標，即使鼠標不動
                         requestAnimationFrame(update);
                    };

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('wheel', onWheel);
                    
                    return () => {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('wheel', onWheel);
                    };
                }, [screenToFlowPosition, project]);

                useEffect(() => {
                    // 提供 fitView 方法
                    flowWrapperRef.doFitView = (options = {}) => {
                        window.requestAnimationFrame(() => {
                            const nodes = getNodes();
                            const nodesWithDims = nodes.filter(n => n.width && n.height && n.width > 0 && n.height > 0);
                            
                            console.log('[FitView] Nodes:', nodes.length, 'WithDims:', nodesWithDims.length);
                            
                            if (nodes.length > 0 && nodesWithDims.length === 0) {
                                console.log('[FitView] Waiting for dimensions...');
                                setTimeout(() => flowWrapperRef.doFitView(options), 50);
                                return;
                            }

                            // 檢查是否已更新為正規化後的座標 (MinX 應接近 50)
                            let minX = Infinity, minY = Infinity;
                            let maxX = -Infinity, maxY = -Infinity;
                            
                            nodes.forEach(n => {
                                const x = n.position.x;
                                const y = n.position.y;
                                const w = n.width || n.measured?.width || 200;
                                const h = n.height || n.measured?.height || 50;
                                
                                if (x < minX) minX = x;
                                if (y < minY) minY = y;
                                if (x + w > maxX) maxX = x + w;
                                if (y + h > maxY) maxY = y + h;
                            });

                            if (nodes.length > 0 && minX > 60) {
                                console.log('[FitView] Store not normalized yet, minX:', minX);
                                setTimeout(() => flowWrapperRef.doFitView(options), 50);
                                return;
                            }
                            
                            const vpBefore = getViewport();
                            console.log('[FitView] Executing. Viewport before:', JSON.stringify(vpBefore));
                            
                            if (options.preserveZoom) {
                                // 僅計算中心點並平移，保留當前 Zoom
                                const centerX = (minX + maxX) / 2;
                                const centerY = (minY + maxY) / 2;
                                console.log('[FitView] Preserving zoom:', vpBefore.zoom, 'Centering to:', centerX, centerY);
                                setCenter(centerX, centerY, { zoom: vpBefore.zoom, duration: 800 });
                            } else {
                                // 預設行為：縮放以適應螢幕
                                fitView({ padding: 0.5, duration: 800 });
                                
                                setTimeout(() => {
                                    const vpAfter = getViewport();
                                    console.log('[FitView] Viewport after:', JSON.stringify(vpAfter));
                                    console.log('[FitView] Zoom changed from', vpBefore.zoom, 'to', vpAfter.zoom);
                                }, 850);
                            }
                        });
                    };

                    // 計算並更新邊界 - 直接使用 getNodes() 確保資料最新
                    flowWrapperRef.updateBounds = () => {
                        const nodes = getNodes();
                        if (nodes.length === 0) {
                            setBounds(null);
                            return;
                        }
                        
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        nodes.forEach(node => {
                            const x = node.position.x;
                            const y = node.position.y;
                            const w = node.width || node.style?.width || 200;
                            const h = node.height || node.style?.height || 50;
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x + w);
                            maxY = Math.max(maxY, y + h);
                        });
                        
                        const boundsData = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
                        console.log('[UpdateBounds] Calculated bounds:', JSON.stringify(boundsData));
                        console.log('[UpdateBounds] Bounds dimensions:', boundsData.width, 'x', boundsData.height);
                        setBounds(boundsData);
                    };

                    // 使用最新的節點資料進行精確導航
        flowWrapperRef.focusElement = (element) => {
            const nodes = getNodes();
            const nodeMap = new Map(nodes.map(n => [n.id, n]));
            
            // 取得當前 viewport
            const currentViewport = getViewport();
            
            console.log('[Focus] Type:', element.type, 'ID:', element.data?.id || element.data?.source);
            console.log('[Focus] Viewport BEFORE:', JSON.stringify(currentViewport));
            
            // 獲取 ReactFlow 容器的實際尺寸
            const flowElement = document.querySelector('.react-flow');
            if (!flowElement) {
                console.log('[Focus] ERROR: ReactFlow element not found');
                return;
            }
            const rect = flowElement.getBoundingClientRect();
            const viewportWidth = rect.width;
            const viewportHeight = rect.height;
            
            // 獲取側邊欄寬度（如果存在）
            const sidebar = document.querySelector('.property-panel');
            const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 0;
            
            console.log('[Focus] Window size:', window.innerWidth, 'x', window.innerHeight);
            console.log('[Focus] ReactFlow viewport size:', viewportWidth, 'x', viewportHeight);
            console.log('[Focus] Sidebar width:', sidebarWidth);
            console.log('[Focus] ReactFlow left offset:', rect.left);
            
            // 輔助函式：計算節點絕對座標
            const getAbsPos = (n) => {
                let x = n.position.x;
                let y = n.position.y;
                let pid = n.parentNode || (n.data && n.data.parentNode);
                let depth = 0;
                while(pid && depth < 20) {
                    const p = nodeMap.get(pid);
                    if(!p) break;
                    x += p.position.x;
                    y += p.position.y;
                    pid = p.parentNode || (p.data && p.data.parentNode);
                    depth++;
                }
                return { x, y };
            };

            if (element.type === 'node') {
                const nodeId = element.data.id || element.data.data?.id;
                const foundNode = nodeMap.get(nodeId);
                
                if (foundNode && foundNode.position) {
                    const { x: absX, y: absY } = getAbsPos(foundNode);
                    const w = foundNode.width || foundNode.style?.width || 200;
                    const h = foundNode.height || foundNode.style?.height || 50;
                    const targetX = absX + w / 2;
                    const targetY = absY + h / 2;
                    
                    console.log('[Focus] Target node Absolute Center:', targetX, targetY);
                    
                    const zoom = currentViewport.zoom;
                    // 使用 setCenter 取代手動計算 setViewport，更加準確且易於管理
                    setCenter(targetX, targetY, { zoom, duration: 800 });
                }
            } else if (element.type === 'edge') {
                const sourceNode = nodeMap.get(element.data.source);
                const targetNode = nodeMap.get(element.data.target);
                
                console.log('[Focus] Edge source:', element.data.source, 'target:', element.data.target);
                
                // 檢測自循環
                if (element.data.source === element.data.target) {
                    console.log('[Focus] Self-loop detected, skipping viewport change');
                    return;
                }
                
                // 優先使用絕對座標計算中點
                if (sourceNode && targetNode && sourceNode.position && targetNode.position) {
                    const { x: fsx, y: fsy } = getAbsPos(sourceNode);
                    const { x: ftx, y: fty } = getAbsPos(targetNode);
                    
                    const sx = fsx + (sourceNode.width || 200) / 2;
                    const sy = fsy + (sourceNode.height || 50) / 2;
                    const tx = ftx + (targetNode.width || 200) / 2;
                    const ty = fty + (targetNode.height || 50) / 2;
                    
                    const targetX = (sx + tx) / 2;
                    const targetY = (sy + ty) / 2;
                    
                    console.log('[Focus] Using Absolute calculated midpoint:', targetX, targetY);
                    
                    const zoom = currentViewport.zoom;
                    setCenter(targetX, targetY, { zoom, duration: 800 });
                    return;
                }
                
                // Fallback: 嘗試從標籤中提取座標（如果節點位置丟失）
                let label = element.data.label || '';
                if (typeof label !== 'string') label = String(label);

                const parts = label.split(/[^0-9.-]+/);
                const numbers = parts.filter(p => p && p.trim() !== '' && !isNaN(parseFloat(p))).map(p => parseFloat(p));
                
                if (numbers.length >= 2) {
                    const len = numbers.length;
                    const labelX = numbers[len - 2];
                    const labelY = numbers[len - 1];
                    console.log('[Focus] Fallback to Label coords:', labelX, labelY);
                    
                    const zoom = currentViewport.zoom;
                    setCenter(labelX, labelY, { zoom, duration: 800 });
                } else {
                    console.log('[Focus] Cannot determine edge position (nodes missing and no label coords)');
                }
            }
        };
                    
                    // 初始計算邊界
                    flowWrapperRef.updateBounds();
                }, [setCenter, getNodes, fitView, flowWrapperRef]);


                
                
                // 計算整個 Diagram 的尺寸
                const diagramSize = useMemo(() => {
                    if (nodes.length === 0) return { w: 0, h: 0 };
                    
                    let minX = Infinity, minY = Infinity;
                    let maxX = -Infinity, maxY = -Infinity;
                    
                    // Debug info collection
                    let debugNodeCount = 0;

                    // 輔助函式：計算節點絕對座標
                    const getAbsPos = (n) => {
                        let x = n.position.x;
                        let y = n.position.y;
                        // parentNode 是 React Flow Node 的直接屬性
                        let pid = n.parentNode || (n.data && n.data.parentNode);
                        let depth = 0;
                        while(pid && depth < 20) {
                            const p = nodes.find(x => x.id === pid);
                            if(!p) break;
                            x += p.position.x;
                            y += p.position.y;
                            pid = p.parentNode || (p.data && p.data.parentNode);
                            depth++;
                        }
                        return { x, y };
                    };
                    
                    nodes.forEach(node => {
                        const { x, y } = getAbsPos(node);
                        // 嘗試多種來源讀取寬高：measured (v11+), width屬性, style屬性, 最後 fallback
                        const w = node.measured?.width ?? node.width ?? (node.style?.width ? parseInt(node.style.width.toString()) : 0) ?? 200;
                        const h = node.measured?.height ?? node.height ?? (node.style?.height ? parseInt(node.style.height.toString()) : 0) ?? 50;
                        
                        // Debug log for first few nodes or suspicious ones
                        if (debugNodeCount < 3) {
                            console.log('[DiagramSize Debug] Node ' + node.id + ': Abs(' + x + ', ' + y + '), Size(' + w + ', ' + h + ')');
                            debugNodeCount++;
                        }

                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        // 確保 w, h 有數值，避免 NaN
                        const validW = w || 200;
                        const validH = h || 50;
                        maxX = Math.max(maxX, x + validW);
                        maxY = Math.max(maxY, y + validH);
                    });
                    
                    if (minX === Infinity) return { w: 0, h: 0 };
                    
                    const calculatedW = Math.round(maxX - minX);
                    const calculatedH = Math.round(maxY - minY);
                    console.log('[DiagramSize Debug] Bounds: [' + minX + ', ' + minY + ', ' + maxX + ', ' + maxY + '], Size: ' + calculatedW + 'x' + calculatedH);
                    
                    return { w: calculatedW, h: calculatedH };
                }, [nodes]);

                // 顯示座標面板 (Bottom Right)
                return React.createElement(Panel, { position: 'top-right', className: 'bg-black/70 p-2 rounded text-xs font-mono pointer-events-none z-50' },
                    React.createElement('div', { className: 'text-yellow-400 mb-1' }, 'Viewport Center (' + cursorInfo.cx + ', ' + cursorInfo.cy + ')'),
                    React.createElement('div', { className: 'text-red-400 mb-1' }, 'Viewport Cursor (' + cursorInfo.vx + ', ' + cursorInfo.vy + ')'),
                    React.createElement('div', { className: 'text-orange-400 mb-1' }, 'Viewport Size (' + cursorInfo.vw + ', ' + cursorInfo.vh + ')'),
                    React.createElement('div', { className: 'text-green-400 mb-1' }, 'Diagram Cursor (' + cursorInfo.dx + ', ' + cursorInfo.dy + ')'),
                    React.createElement('div', { className: 'text-blue-400' }, 'Diagram Size (' + diagramSize.w + ', ' + diagramSize.h + ')')
                );
            }

            return React.createElement('div', { className: 'flex w-full h-full' },
                // 畫布區
                React.createElement('div', { className: 'flex-grow h-full relative' },
                    React.createElement(ReactFlow, {
                        nodes: processedNodes,
                        edges: processedEdges,
                        onNodesChange: onNodesChange,
                        onEdgesChange: onEdgesChange,
                        onNodeClick: onNodeClick,
                        onEdgeClick: onEdgeClick,
                        onPaneClick: onPaneClick,
                        nodeTypes: nodeTypes,
                        fitView: false,
                        fitViewOptions: { padding: 0.3, maxZoom: 1.5, minZoom: 0.01 },
                        minZoom: 0.01,
                        maxZoom: 2,
                        style: { background: '#121212' }
                    }, 
                        React.createElement(FlowController, { flowWrapperRef, currentNodes: processedNodes }),
                        React.createElement(Background, { color: '#333', gap: 16 }),
                        React.createElement(Controls, { style: { marginBottom: 32 } }),
                        React.createElement(MiniMap, { 
                            nodeColor: (node) => node.data?.borderColor || '#4299e1',
                            nodeStrokeWidth: 2,
                            nodeBorderRadius: 4,
                            style: { 
                                background: '#1e293b',
                                border: '1px solid #334155',
                                marginBottom: 32
                            },
                            maskColor: 'rgba(0, 0, 0, 0.5)',
                            // 點擊 MiniMap 節點時，置中並保留縮放比例
                            onNodeClick: (event, node) => {
                                // 計算絕對座標 (Inline 邏輯以避免 Scope 問題)
                                let x = node.position.x;
                                let y = node.position.y;
                                // 嘗試尋找父節點
                                let pid = node.parentNode || (node.data && node.data.parentNode);
                                let depth = 0;
                                
                                while(pid && depth < 20) {
                                    const p = nodes.find(n => n.id === pid);
                                    if(!p) break;
                                    x += p.position.x;
                                    y += p.position.y;
                                    pid = p.parentNode || (p.data && p.data.parentNode);
                                    depth++;
                                }

                                const w = node.width || node.measured?.width || 200;
                                const h = node.height || node.measured?.height || 50;
                                const centerX = x + w / 2;
                                const centerY = y + h / 2;

                                console.log('[MiniMap] Clicked node:', node.id, 'AbsCenter:', centerX, centerY);
                                
                                const { zoom } = reactFlowInstance.getViewport();
                                reactFlowInstance.setCenter(centerX, centerY, { zoom, duration: 800 });
                            },
                            // 點擊 MiniMap 空白區域時，也能跳轉並保留縮放比例
                            onClick: (event) => {
                                // MiniMap 的點擊事件會傳入原始的 MouseEvent
                                // 需要將 MiniMap 上的點擊座標轉換為 Flow 座標
                                const miniMapElement = event.currentTarget;
                                const rect = miniMapElement.getBoundingClientRect();
                                
                                // 計算點擊位置在 MiniMap 中的相對位置 (0-1)
                                const relativeX = (event.clientX - rect.left) / rect.width;
                                const relativeY = (event.clientY - rect.top) / rect.height;
                                
                                // 計算絕對座標的輔助函數
                                const getAbsPos = (node) => {
                                    let x = node.position.x;
                                    let y = node.position.y;
                                    let pid = node.parentNode || (node.data && node.data.parentNode);
                                    let depth = 0;
                                    
                                    while(pid && depth < 20) {
                                        const p = nodes.find(n => n.id === pid);
                                        if(!p) break;
                                        x += p.position.x;
                                        y += p.position.y;
                                        pid = p.parentNode || (p.data && p.data.parentNode);
                                        depth++;
                                    }
                                    return { x, y };
                                };
                                
                                // 獲取當前視口資訊
                                const viewport = reactFlowInstance.getViewport();
                                
                                // 使用絕對座標計算 Flow 邊界
                                const flowBounds = reactFlowInstance.getNodes().reduce((acc, node) => {
                                    const absPos = getAbsPos(node);
                                    const w = node.width || node.measured?.width || 200;
                                    const h = node.height || node.measured?.height || 50;
                                    
                                    return {
                                        minX: Math.min(acc.minX, absPos.x),
                                        minY: Math.min(acc.minY, absPos.y),
                                        maxX: Math.max(acc.maxX, absPos.x + w),
                                        maxY: Math.max(acc.maxY, absPos.y + h)
                                    };
                                }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
                                
                                // 計算目標 Flow 座標（使用絕對座標系統）
                                const flowWidth = flowBounds.maxX - flowBounds.minX;
                                const flowHeight = flowBounds.maxY - flowBounds.minY;
                                const targetX = flowBounds.minX + flowWidth * relativeX;
                                const targetY = flowBounds.minY + flowHeight * relativeY;
                                
                                console.log('[MiniMap] Clicked empty area:', 'RelativePos:', relativeX.toFixed(3), relativeY.toFixed(3), 'FlowPos:', Math.round(targetX), Math.round(targetY));
                                
                                // 保留當前縮放比例，僅移動視口中心
                                reactFlowInstance.setCenter(targetX, targetY, { zoom: viewport.zoom, duration: 800 });
                            }
                        }),
                        React.createElement(Panel, { position: 'top-left', className: 'bg-[#2d3748] p-2 rounded shadow-lg border border-[#4a5568]' },
                            React.createElement('button', { 
                                onClick: () => onLayout('TB', true),
                                className: 'bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors'
                            }, 'Auto Layout')
                        ),
                        // 導航提示面板
                        React.createElement(Panel, { position: 'bottom-center', className: 'bg-[#2d3748] p-2 rounded shadow-lg border border-[#4a5568] text-xs text-gray-400 mb-2' },
                            React.createElement('div', null, '🖱️ 拖曳平移 | 滾輪縮放 | 縮圖導航 (點擊跳轉)')
                        )
                    )
                ),
                // 屬性側邊欄
                selectedElement && React.createElement('div', { 
                    className: 'w-80 bg-[#1e293b] border-l border-[#334155] p-4 flex flex-col gap-4 text-sm overflow-auto max-h-full property-panel' 
                },
                    React.createElement('h3', { className: 'text-lg font-bold border-b border-[#334155] pb-2 text-blue-400' }, 
                        selectedElement.type === 'node' ? 'State Properties' : 'Transition Properties'
                    ),
                    selectedElement.type === 'node' ? [
                            React.createElement('div', { key: 'id-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'State ID'),
                                React.createElement('input', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                    value: selectedElement.data.id || '',
                                    readOnly: true, // ID 目前不建議更改，因為是連線 Key
                                    style: { opacity: 0.5 }
                                })
                            ),
                            React.createElement('div', { key: 'qt-position-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Qt Position'),
                                React.createElement('input', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                    value: selectedElement.data.data.qtGeometry ? 
                                        selectedElement.data.data.qtGeometry.x + ', ' + selectedElement.data.data.qtGeometry.y : 'N/A',
                                    readOnly: true,
                                    style: { opacity: 0.5 }
                                })
                            ),
                            React.createElement('div', { key: 'position-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 
                                    'Layout Position' + (selectedElement.data.parentNode ? ' (Relative)' : '')
                                ),
                                React.createElement('input', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                    value: selectedElement.data.position ? 
                                        Math.round(selectedElement.data.position.x) + ', ' + Math.round(selectedElement.data.position.y) : 'N/A',
                                    readOnly: true,
                                    style: { opacity: 0.5 }
                                })
                            ),
                            React.createElement('div', { key: 'abs-position-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Absolute Position'),
                                React.createElement('input', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                    value: (() => {
                                        if (!selectedElement.data.position) return 'N/A';
                                        
                                        // 遞迴計算絕對座標
                                        let x = selectedElement.data.position.x;
                                        let y = selectedElement.data.position.y;
                                        let parentId = selectedElement.data.parentNode;
                                        
                                        console.log('[AbsPos debug] Start: ' + selectedElement.data.id + ' (' + x + ', ' + y + '), Parent: ' + parentId);
                                        
                                        while (parentId) {
                                            const parent = nodes.find(n => n.id === parentId);
                                            if (!parent) {
                                                console.warn('[AbsPos debug] Parent not found: ' + parentId);
                                                break;
                                            }
                                            console.log('[AbsPos debug] + Parent ' + parent.id + ': (' + parent.position.x + ', ' + parent.position.y + ')');
                                            x += parent.position.x;
                                            y += parent.position.y;
                                            parentId = parent.parentNode;
                                        }
                                        console.log('[AbsPos debug] Result: (' + x + ', ' + y + ')');
                                        
                                        return Math.round(x) + ', ' + Math.round(y);
                                    })(),
                                    readOnly: true,
                                    style: { opacity: 0.5 }
                                })
                            ),
                        React.createElement('div', { key: 'label-field' },
                            React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Display Name'),
                            React.createElement('input', {
                                className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                value: (selectedElement.data.data.label || '').replace(/\s*\(\d+,\s*\d+\)$/, ''),
                                onChange: (e) => onInputChange('label', e.target.value)
                            })
                        ),
                        React.createElement('div', { key: 'onentry-field' },
                            React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'OnEntry Script'),
                            React.createElement('textarea', {
                                className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none font-mono text-xs h-24',
                                value: selectedElement.data.data.onentry || '',
                                onChange: (e) => onInputChange('onentry', e.target.value)
                            })
                        ),
                        React.createElement('div', { key: 'onexit-field' },
                            React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'OnExit Script'),
                            React.createElement('textarea', {
                                className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none font-mono text-xs h-24',
                                value: selectedElement.data.data.onexit || '',
                                onChange: (e) => onInputChange('onexit', e.target.value)
                            }),
                        // 離開 (Outgoing) Transitions - 包含自循環
                        React.createElement('div', { key: 'outgoing-transitions-list', className: 'mt-4' },
                        React.createElement('label', { className: 'block text-gray-400 mb-2 font-semibold' }, '離開 (' + processedEdges.filter(e => e.source === selectedElement.data.id).length + ')'),
                            React.createElement('div', { className: 'space-y-2 max-h-48 overflow-y-auto' },
                                processedEdges.filter(e => e.source === selectedElement.data.id).map((edge, idx) =>
                                    React.createElement('div', {
                                        key: 'out-' + idx,
                                        className: 'bg-[#0f172a] border border-[#334155] p-2 rounded text-xs cursor-pointer hover:border-blue-500 transition-colors',
                                        onClick: () => {
                                            const elem = {
                                                type: 'edge',
                                                data: edge
                                            };
                                            setSelectedElement(elem);
                                            if (flowWrapperRef.focusElement) {
                                                flowWrapperRef.focusElement(elem);
                                            }
                                        }
                                    },
                                        React.createElement('div', { className: 'flex justify-between items-center' },
                                            React.createElement('span', { 
                                                className: 'font-semibold',
                                                style: { color: edge.style?.stroke || '#888' }
                                            }, (edge.data?.label || edge.label || '(no event)')),
                                            React.createElement('span', { className: 'text-gray-500' }, 
                                                edge.source === edge.target ? '↺ 自循環' : '→ ' + edge.target
                                            )
                                        ),
                                        edge.cond && React.createElement('div', { className: 'text-gray-400 mt-1 italic' }, 'Cond: ' + edge.cond)
                                    )
                                ).concat(
                                    processedEdges.filter(e => e.source === selectedElement.data.id).length === 0 
                                        ? [React.createElement('div', { key: 'no-out', className: 'text-gray-500 text-xs italic' }, '無離開的 transitions')]
                                        : []
                                )
                            )
                        ),
                        // 進入 (Incoming) Transitions - 不包含自循環
                        React.createElement('div', { key: 'incoming-transitions-list', className: 'mt-4' },
                            React.createElement('label', { className: 'block text-gray-400 mb-2 font-semibold' }, '進入 (' + processedEdges.filter(e => e.target === selectedElement.data.id && e.source !== e.target).length + ')'),
                            React.createElement('div', { className: 'space-y-2 max-h-48 overflow-y-auto' },
                                processedEdges.filter(e => e.target === selectedElement.data.id && e.source !== e.target).map((edge, idx) =>
                                    React.createElement('div', {
                                        key: 'in-' + idx,
                                        className: 'bg-[#0f172a] border border-[#334155] p-2 rounded text-xs cursor-pointer hover:border-blue-500 transition-colors',
                                        onClick: () => {
                                            const elem = {
                                                type: 'edge',
                                                data: edge
                                            };
                                            setSelectedElement(elem);
                                            if (flowWrapperRef.focusElement) {
                                                flowWrapperRef.focusElement(elem);
                                            }
                                        }
                                    },
                                        React.createElement('div', { className: 'flex justify-between items-center' },
                                            React.createElement('span', { className: 'text-gray-500' }, edge.source + ' →'),
                                            React.createElement('span', { 
                                                className: 'font-semibold',
                                                style: { color: edge.style?.stroke || '#888' }
                                            }, (edge.data?.label || edge.label || '(no event)'))
                                        ),
                                        edge.cond && React.createElement('div', { className: 'text-gray-400 mt-1 italic' }, 'Cond: ' + edge.cond)
                                    )
                                ).concat(
                                    processedEdges.filter(e => e.target === selectedElement.data.id && e.source !== e.target).length === 0 
                                        ? [React.createElement('div', { key: 'no-in', className: 'text-gray-500 text-xs italic' }, '無進入的 transitions')]
                                        : []
                                )
                            )
                        )
                        )
                    ] : [
                        React.createElement('div', { key: 'event-field' },
                            React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Event'),
                            React.createElement('input', {
                                className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                value: (selectedElement.data.label || '').replace(/\s*\(\d+,\s*\d+\)$/, ''),
                                onChange: (e) => onInputChange('label', e.target.value)
                            })
                        ),
                            React.createElement('div', { key: 'qt-position-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Qt Position'),
                                React.createElement('input', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                    value: selectedElement.data.qtPoint ? 
                                        selectedElement.data.qtPoint.x + ', ' + selectedElement.data.qtPoint.y : 'N/A',
                                    readOnly: true,
                                    style: { opacity: 0.5 }
                                })
                            ),
                            React.createElement('div', { key: 'edge-position-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Layout Position (Relative)'),
                                React.createElement('input', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                    value: (() => {
                                        if (selectedElement.data.source && selectedElement.data.target && nodes) {
                                            const sourceNode = nodes.find(n => n.id === selectedElement.data.source);
                                            const targetNode = nodes.find(n => n.id === selectedElement.data.target);
                                            if (sourceNode && targetNode && sourceNode.position && targetNode.position && selectedElement.data.source !== selectedElement.data.target) {
                                                const sx = sourceNode.position.x + (sourceNode.width || 200) / 2;
                                                const sy = sourceNode.position.y + (sourceNode.height || 50) / 2;
                                                const tx = targetNode.position.x + (targetNode.width || 200) / 2;
                                                const ty = targetNode.position.y + (targetNode.height || 50) / 2;
                                                return Math.round((sx + tx) / 2) + ', ' + Math.round((sy + ty) / 2);
                                            }
                                        }
                                        // Fallback to label parsing if nodes not found
                                        const label = selectedElement.data.label || '';
                                        if (typeof label !== 'string') return 'Auto';
                                        const match = label.match(/\s*\((\d+),\s*(\d+)\)$/);
                                        return match ? match[1] + ', ' + match[2] : 'Auto';
                                    })(),
                                    readOnly: true,
                                    style: { opacity: 0.5 }
                                })
                            ),
                            React.createElement('div', { key: 'edge-abs-position-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Absolute Position'),
                                React.createElement('input', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                    value: (() => {
                                        const getAbs = (n) => {
                                            if (!n || !n.position) return { x: 0, y: 0 };
                                            let x = n.position.x;
                                            let y = n.position.y;
                                            let pid = n.data && n.data.parentNode; 
                                            while(pid) {
                                                const p = nodes.find(x => x.id === pid);
                                                if(!p) break;
                                                x += p.position.x;
                                                y += p.position.y;
                                                pid = p.data && p.data.parentNode;
                                            }
                                            return { x, y };
                                        };

                                        if (selectedElement.data.source && selectedElement.data.target && nodes) {
                                            const sourceNode = nodes.find(n => n.id === selectedElement.data.source);
                                            const targetNode = nodes.find(n => n.id === selectedElement.data.target);
                                            
                                            if (sourceNode && targetNode && selectedElement.data.source !== selectedElement.data.target) {
                                                const sPos = getAbs(sourceNode);
                                                const tPos = getAbs(targetNode);
                                                
                                                const sx = sPos.x + (sourceNode.width || 200) / 2;
                                                const sy = sPos.y + (sourceNode.height || 50) / 2;
                                                const tx = tPos.x + (targetNode.width || 200) / 2;
                                                const ty = tPos.y + (targetNode.height || 50) / 2;
                                                
                                                return Math.round((sx + tx) / 2) + ', ' + Math.round((sy + ty) / 2);
                                            }
                                        }
                                        return 'N/A';
                                    })(),
                                    readOnly: true,
                                    style: { opacity: 0.5 }
                                })
                            ),


                        React.createElement('div', { key: 'cond-field' },
                            React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Condition (cond)'),
                            React.createElement('input', {
                                className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                value: selectedElement.data.cond || '',
                                onChange: (e) => onInputChange('cond', e.target.value)
                            })
                        ),
                        // 開始 State (Source)
                        React.createElement('div', { key: 'source-state', className: 'mt-4' },
                            React.createElement('label', { className: 'block text-gray-400 mb-2 font-semibold' }, '開始 State'),
                            React.createElement('div', { className: 'space-y-2' },
                                nodes.filter(node => node.id === selectedElement.data.source).map((node, idx) =>
                                    React.createElement('div', {
                                        key: 'source-' + idx,
                                        className: 'bg-[#0f172a] border border-[#334155] p-2 rounded text-xs cursor-pointer hover:border-blue-500 transition-colors',
                                        style: {
                                            borderLeftWidth: '3px',
                                            borderLeftColor: node.data?.borderColor || '#4299e1'
                                        },
                                        onClick: () => {
                                            const elem = {
                                                type: 'node',
                                                data: node
                                            };
                                            setSelectedElement(elem);
                                            if (flowWrapperRef.focusElement) {
                                                flowWrapperRef.focusElement(elem);
                                            }
                                        }
                                    },
                                        React.createElement('div', { className: 'flex justify-between items-center' },
                                            React.createElement('span', { 
                                                className: 'font-semibold',
                                                style: { color: node.data?.borderColor || '#4299e1' }
                                            }, node.data?.label || node.id),
                                            React.createElement('span', { className: 'text-gray-500 text-[10px]' }, node.data?.type || 'state')
                                        ),
                                        React.createElement('div', { className: 'text-gray-400 mt-1 text-[10px]' }, 
                                            'ID: ' + node.id + ' (' + Math.round(node.position.x + (node.width || 200) / 2) + ', ' + Math.round(node.position.y + (node.height || 50) / 2) + ')'
                                        )
                                    )
                                )
                            )
                        ),
                        // 結束 State (Target)
                        React.createElement('div', { key: 'target-state', className: 'mt-4' },
                            React.createElement('label', { className: 'block text-gray-400 mb-2 font-semibold' }, '結束 State'),
                            React.createElement('div', { className: 'space-y-2' },
                                nodes.filter(node => node.id === selectedElement.data.target).map((node, idx) =>
                                    React.createElement('div', {
                                        key: 'target-' + idx,
                                        className: 'bg-[#0f172a] border border-[#334155] p-2 rounded text-xs cursor-pointer hover:border-blue-500 transition-colors',
                                        style: {
                                            borderLeftWidth: '3px',
                                            borderLeftColor: node.data?.borderColor || '#4299e1'
                                        },
                                        onClick: () => {
                                            const elem = {
                                                type: 'node',
                                                data: node
                                            };
                                            setSelectedElement(elem);
                                            if (flowWrapperRef.focusElement) {
                                                flowWrapperRef.focusElement(elem);
                                            }
                                        }
                                    },
                                        React.createElement('div', { className: 'flex justify-between items-center' },
                                            React.createElement('span', { 
                                                className: 'font-semibold',
                                                style: { color: node.data?.borderColor || '#4299e1' }
                                            }, node.data?.label || node.id),
                                            React.createElement('span', { className: 'text-gray-500 text-[10px]' }, node.data?.type || 'state')
                                        ),
                                        React.createElement('div', { className: 'text-gray-400 mt-1 text-[10px]' }, 
                                            'ID: ' + node.id + ' (' + Math.round(node.position.x + (node.width || 200) / 2) + ', ' + Math.round(node.position.y + (node.height || 50) / 2) + ')'
                                        )
                                    )
                                )
                            )
                        )
                    ]
                )
            );
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'init') {
                try {
                    // 用 ReactFlowProvider 包裹 Editor，讓 useReactFlow 能正確運作
                    root.render(
                        React.createElement(ReactFlowProvider, null,
                            React.createElement(Editor, { initialData: message.data })
                        )
                    );
                } catch (err) {
                    window.onerror(err.message, 'react-render', 0, 0, err);
                }
            }
        });
    </script>
</body>
</html>`;
}

export function deactivate() { }
