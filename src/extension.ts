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

        // 獲取當前設定
        const config = vscode.workspace.getConfiguration('cellScxmlEditor');
        const showDebugInfo = config.get<boolean>('showDebugInfo', true);

        panel.webview.html = getWebviewContent();

        // 確保 Webview 載入完成後發送初始資料
        setTimeout(() => {
            panel.webview.postMessage({
                command: 'init',
                data: flowData,
                settings: { showDebugInfo }
            });
        }, 1000);

        // 監聽設定變更
        const configListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cellScxmlEditor.showDebugInfo')) {
                const newShowDebugInfo = vscode.workspace.getConfiguration('cellScxmlEditor').get<boolean>('showDebugInfo', true);
                panel.webview.postMessage({
                    command: 'updateSettings',
                    settings: { showDebugInfo: newShowDebugInfo }
                });
            }
        });

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

        panel.onDidDispose(() => {
            configListener.dispose();
        }, null, context.subscriptions);
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
        .scxml-state { border-style: solid; }
        .scxml-parallel { border-style: dashed; }
        .scxml-final { border-style: double; }
        .scxml-compound { 
            border-style: solid; 
            border-width: 2px !important;
            background: rgba(255, 255, 255, 0.03) !important;
        }
        .scxml-node { 
        .loop-container {
            margin-top: 8px;
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 4px;
            width: 100%;
        }
        .loop-tag {
            background: rgba(255,255,255,0.1);
            border: 1px solid currentColor;
            border-radius: 4px;
            padding: 2px 6px;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            opacity: 0.8;
        }
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
            ReactFlowProvider,
            BezierEdge
        } from 'reactflow';
        import dagre from 'dagre';

        // 自定義 Edge 組件，支援動態曲率 (Curvature)
        const CustomEdge = (props) => {
            const { data } = props;
            return React.createElement(BezierEdge, {
                ...props,
                curvature: data?.curvature
            });
        };

        // 自定義 SCXML 節點組件，支援多 Handle
        const ScxmlNode = ({ data, id }) => {
            const sources = Array.from({ length: (data && data.sourceCount) || 0 }, (_, i) => i + 1);
            const targets = Array.from({ length: (data && data.targetCount) || 0 }, (_, i) => i + 1);
            const borderColor = (data && data.borderColor) || '#4299e1';
            const isCompound = data && data.isCompound;
            const isCollapsed = data && data.isCollapsed;

            const onToggleCollapse = (e) => {
                e.stopPropagation();
                if (data.onToggleCollapse) {
                    data.onToggleCollapse(id);
                }
            };

            const onLayoutChildren = (e) => {
                e.stopPropagation();
                if (data.onLayoutChildren) {
                    data.onLayoutChildren(id);
                }
            };

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
                padding: '0px', 
                borderRadius: '12px',
                minWidth: '180px',
                overflow: 'visible',
                boxSizing: 'border-box',
                width: '100%',
                height: '100%'
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
                
                // 節點內容 (包含收摺按鈕與排版按鈕)
                React.createElement('div', { 
                    className: 'flex items-center w-full ' + (isCompound ? 'mb-2' : 'justify-center pointer-events-none'),
                    style: { padding: '16px 16px 0 16px' } 
                },
                    isCompound && React.createElement('button', {
                        className: 'mr-1 text-lg hover:bg-white/10 rounded w-6 h-6 flex items-center justify-center transition-colors',
                        onClick: onToggleCollapse,
                        style: { color: borderColor },
                        title: isCollapsed ? 'Expand' : 'Collapse'
                    }, isCollapsed ? '⊕' : '⊖'),
                    isCompound && !isCollapsed && React.createElement('button', {
                        className: 'mr-2 text-lg hover:bg-white/10 rounded w-6 h-6 flex items-center justify-center transition-colors',
                        onClick: onLayoutChildren,
                        style: { color: borderColor },
                        title: 'Auto Layout Children'
                    }, '⌖'),
                    React.createElement('div', { 
                        className: 'font-bold truncate',
                        style: { 
                            color: borderColor, 
                            fontSize: isCompound ? '16px' : '14px',
                            letterSpacing: '0.5px',
                            textShadow: '0 0 10px ' + borderColor + '44',
                            flexGrow: 1,
                            textAlign: isCompound ? 'left' : 'center'
                        }
                    }, data && data.label)
                ),

                // 循環 (Loops) 清單
                data && data.loops && data.loops.length > 0 && React.createElement('div', {
                    className: 'loop-container',
                    style: { padding: '0 16px' } // 在內部保留循環標籤間距
                }, data.loops.map((loop, idx) => React.createElement('div', {
                    key: 'loop-' + idx,
                    className: 'loop-tag',
                    style: { color: borderColor }
                }, "↻ " + (loop.event || 'unnamed')))),
                
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
            final: ScxmlNode,
            compound: ScxmlNode
        };

        const dagreGraph = new dagre.graphlib.Graph({ compound: true });
        dagreGraph.setDefaultEdgeLabel(() => ({}));

        const defaultNodeWidth = 200;
        const defaultNodeHeight = 50;

        const getLayoutedElements = (nodes, edges, direction = 'TB') => {
            dagreGraph.setGraph({ 
                rankdir: direction,
                nodesep: 80,      // 增加間距以利於 Compound 顯示
                ranksep: 100,
                marginx: 50,
                marginy: 50,
                ranker: 'network-simplex',
                edgesep: 10,
                compound: true    // 啟動 Compound Graph 支援
            });

            // 首先設定所有節點
            nodes.forEach((node) => {
                const w = node.width || node.style?.width || defaultNodeWidth;
                const h = node.height || node.style?.height || defaultNodeHeight;
                dagreGraph.setNode(node.id, { width: w, height: h });
            });

            // 設定父子關係
            nodes.forEach((node) => {
                if (node.parentNode) {
                    dagreGraph.setParent(node.id, node.parentNode);
                }
            });

            edges.forEach((edge) => {
                dagreGraph.setEdge(edge.source, edge.target);
            });

            dagre.layout(dagreGraph);

            // 建立 ID 對應到 Dagre 結果的 Map
            const dagreResults = new Map();
            nodes.forEach(node => {
                const nodeWithPosition = dagreGraph.node(node.id);
                const w = node.width || node.style?.width || defaultNodeWidth;
                const h = node.height || node.style?.height || defaultNodeHeight;
                
                // Dagre 對於 compound node 會自動計算出中心點 x, y 與其子節點合併後的寬高
                dagreResults.set(node.id, {
                    absX: nodeWithPosition.x - nodeWithPosition.width / 2,
                    absY: nodeWithPosition.y - nodeWithPosition.height / 2,
                    w: nodeWithPosition.width,
                    h: nodeWithPosition.height
                });
            });

            // 更新節點位置與尺寸
            nodes.forEach((node) => {
                const res = dagreResults.get(node.id);
                if (!res) return;

                // 更新尺寸以符合 Dagre 計算出的 Compound 尺寸
                node.width = res.w;
                node.height = res.h;
                if (node.style) {
                    node.style.width = res.w;
                    node.style.height = res.h;
                }

                if (node.parentNode) {
                    const parentRes = dagreResults.get(node.parentNode);
                    if (parentRes) {
                        // 轉換絕對座標為相對父節點的座標
                        // 注意：React Flow 的 Parent Node 座標系統中，(0,0) 是父節點左上角
                        node.position = {
                            x: res.absX - parentRes.absX,
                            y: res.absY - parentRes.absY
                        };
                    } else {
                        node.position = { x: res.absX, y: res.absY };
                    }
                } else {
                    node.position = { x: res.absX, y: res.absY };
                }
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

        const PropertyInspector = ({
            isCollapsed,
            onToggleCollapse,
            width,
            onStartResizing,
            selectedElement,
            data, // { nodes, processedEdges }
            onUpdate,
            onSelect
        }) => {
            const { nodes, processedEdges } = data;

            if (isCollapsed || !selectedElement) {
                return React.createElement(React.Fragment, null,
                    // 收摺按鈕
                    isCollapsed && selectedElement && React.createElement('button', {
                        className: 'absolute right-0 top-1/2 -translate-y-1/2 bg-[#1e293b] hover:bg-[#334155] text-white w-6 h-12 rounded-l border border-[#334155] border-r-0 z-50 flex items-center justify-center transition-all shadow-xl',
                        onClick: () => onToggleCollapse(false),
                        title: '展開屬性面板'
                    }, '◀')
                );
            }

            return React.createElement(React.Fragment, null,
                // 調整寬度條 (Splitter)
                React.createElement('div', {
                    className: 'w-1 hover:w-1.5 bg-[#334155] hover:bg-blue-500 cursor-col-resize transition-all z-50 relative group flex-shrink-0',
                    onMouseDown: onStartResizing
                },
                    // 嵌入收摺按鈕在調整條附近
                    React.createElement('button', {
                        className: 'absolute right-full top-1/2 -translate-y-1/2 bg-[#334155] hover:bg-blue-600 text-white w-5 h-10 rounded-l flex items-center justify-center text-[10px] invisible group-hover:visible transition-all shadow-md',
                        onClick: (e) => {
                            e.stopPropagation();
                            onToggleCollapse(true);
                        }
                    }, '▶')
                ),

                // 屬性側邊欄
                React.createElement('div', { 
                    className: 'bg-[#1e293b] border-l border-[#334155] p-4 flex flex-col gap-4 text-sm overflow-auto max-h-full property-panel flex-shrink-0',
                    style: { width: width + 'px' }
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
                                        
                                        while (parentId) {
                                            const parent = nodes.find(n => n.id === parentId);
                                            if (!parent) break;
                                            x += parent.position.x;
                                            y += parent.position.y;
                                            parentId = parent.parentNode;
                                        }
                                        
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
                                    onChange: (e) => onUpdate('label', e.target.value)
                                })
                            ),
                            React.createElement('div', { key: 'initial-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Initial State ID'),
                                React.createElement('input', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                    value: selectedElement.data.data.initial || '',
                                    placeholder: 'Child state ID',
                                    onChange: (e) => onUpdate('initial', e.target.value)
                                })
                            ),
                            React.createElement('div', { key: 'color-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Border Color'),
                                React.createElement('div', { className: 'flex gap-2' },
                                    React.createElement('input', {
                                        type: 'color',
                                        className: 'h-9 bg-transparent cursor-pointer',
                                        value: selectedElement.data.data.borderColor || '#4299e1',
                                        onChange: (e) => onUpdate('borderColor', e.target.value)
                                    }),
                                    React.createElement('input', {
                                        className: 'flex-1 bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                        value: selectedElement.data.data.borderColor || '#4299e1',
                                        onChange: (e) => onUpdate('borderColor', e.target.value)
                                    })
                                )
                            ),
                            React.createElement('div', { key: 'onentry-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'OnEntry Script'),
                                React.createElement('textarea', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none font-mono text-xs h-24',
                                    value: selectedElement.data.data.onentry || '',
                                    onChange: (e) => onUpdate('onentry', e.target.value)
                                })
                            ),
                            React.createElement('div', { key: 'onexit-field' },
                                React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'OnExit Script'),
                                React.createElement('textarea', {
                                    className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none font-mono text-xs h-24',
                                    value: selectedElement.data.data.onexit || '',
                                    onChange: (e) => onUpdate('onexit', e.target.value)
                                })
                            ),
                            // 自循環 (Loops) 區塊
                            React.createElement('div', { key: 'loops-section', className: 'mt-4 border-t border-[#334155] pt-4' },
                                React.createElement('div', { className: 'flex justify-between items-center mb-2' },
                                    React.createElement('label', { className: 'block text-gray-400 font-semibold' }, '循環 (Loops)'),
                                    React.createElement('button', {
                                        className: 'bg-green-600 hover:bg-green-700 text-white px-2 py-0.5 rounded text-[10px] transition-colors',
                                        onClick: () => {
                                            const currentLoops = selectedElement.data.data.loops || [];
                                            const newLoops = [...currentLoops, { event: 'new.event', cond: '' }];
                                            onUpdate('loops', newLoops);
                                        }
                                    }, '+ 新增')
                                ),
                                React.createElement('div', { className: 'space-y-3' },
                                    (selectedElement.data.data.loops || []).map((loop, idx) => 
                                        React.createElement('div', { key: 'loop-edit-' + idx, className: 'bg-[#0f172a] p-2 rounded border border-[#334155] relative' },
                                            React.createElement('button', {
                                                className: 'absolute top-1 right-1 text-gray-500 hover:text-red-500',
                                                onClick: () => {
                                                    const newLoops = selectedElement.data.data.loops.filter((_, i) => i !== idx);
                                                    onUpdate('loops', newLoops);
                                                }
                                            }, '✕'),
                                            React.createElement('div', { className: 'mb-2' },
                                                React.createElement('label', { className: 'block text-[10px] text-gray-500 mb-0.5' }, 'Event'),
                                                React.createElement('input', {
                                                    className: 'w-full bg-[#1e293b] border border-[#334155] px-2 py-1 rounded text-white text-xs outline-none focus:border-blue-500',
                                                    value: loop.event || '',
                                                    onChange: (e) => {
                                                        const newLoops = [...selectedElement.data.data.loops];
                                                        newLoops[idx] = { ...newLoops[idx], event: e.target.value };
                                                        onUpdate('loops', newLoops);
                                                    }
                                                })
                                            ),
                                            React.createElement('div', null,
                                                React.createElement('label', { className: 'block text-[10px] text-gray-500 mb-0.5' }, 'Condition'),
                                                React.createElement('input', {
                                                    className: 'w-full bg-[#1e293b] border border-[#334155] px-2 py-1 rounded text-white text-xs outline-none focus:border-blue-500',
                                                    value: loop.cond || '',
                                                    onChange: (e) => {
                                                        const newLoops = [...selectedElement.data.data.loops];
                                                        newLoops[idx] = { ...newLoops[idx], cond: e.target.value };
                                                        onUpdate('loops', newLoops);
                                                    }
                                                })
                                            )
                                        )
                                    ),
                                    (selectedElement.data.data.loops || []).length === 0 && 
                                        React.createElement('div', { className: 'text-gray-500 text-xs italic text-center py-2' }, '目前無自循環')
                                )
                            ),
                            // 離開 (Outgoing) Transitions
                            React.createElement('div', { key: 'outgoing-transitions-list', className: 'mt-4' },
                                React.createElement('label', { className: 'block text-gray-400 mb-2 font-semibold' }, '離開 (' + processedEdges.filter(e => e.source === selectedElement.data.id).length + ')'),
                                React.createElement('div', { className: 'space-y-2 max-h-48 overflow-y-auto' },
                                    processedEdges.filter(e => e.source === selectedElement.data.id).map((edge, idx) =>
                                        React.createElement('div', {
                                            key: 'out-' + idx,
                                            className: 'bg-[#0f172a] border border-[#334155] p-2 rounded text-xs cursor-pointer hover:border-blue-500 transition-colors',
                                            onClick: () => {
                                                const elem = { type: 'edge', data: edge };
                                                onSelect(elem);
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
                            // 進入 (Incoming) Transitions
                            React.createElement('div', { key: 'incoming-transitions-list', className: 'mt-4' },
                                React.createElement('label', { className: 'block text-gray-400 mb-2 font-semibold' }, '進入 (' + processedEdges.filter(e => e.target === selectedElement.data.id && e.source !== e.target).length + ')'),
                                React.createElement('div', { className: 'space-y-2 max-h-48 overflow-y-auto' },
                                    processedEdges.filter(e => e.target === selectedElement.data.id && e.source !== e.target).map((edge, idx) =>
                                        React.createElement('div', {
                                            key: 'in-' + idx,
                                            className: 'bg-[#0f172a] border border-[#334155] p-2 rounded text-xs cursor-pointer hover:border-blue-500 transition-colors',
                                            onClick: () => {
                                                const elem = { type: 'edge', data: edge };
                                                onSelect(elem);
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
                        ] : [
                        // Transition 屬性
                        React.createElement('div', { key: 'event-field' },
                            React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Event'),
                            React.createElement('input', {
                                className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none',
                                value: (selectedElement.data.label || '').replace(/\s*\(\d+,\s*\d+\)$/, ''),
                                onChange: (e) => onUpdate('label', e.target.value)
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
                                    return 'Auto';
                                })(),
                                readOnly: true,
                                style: { opacity: 0.5 }
                            })
                        ),
                        React.createElement('div', { key: 'cond-field' },
                            React.createElement('label', { className: 'block text-gray-400 mb-1' }, 'Condition'),
                            React.createElement('textarea', {
                                className: 'w-full bg-[#0f172a] border border-[#334155] p-2 rounded text-white focus:border-blue-500 outline-none font-mono text-xs h-16',
                                value: selectedElement.data.cond || '',
                                onChange: (e) => onUpdate('cond', e.target.value)
                            })
                        ),
                        // 來源 (Source) State
                        React.createElement('div', { key: 'source-state', className: 'mt-4' },
                            React.createElement('label', { className: 'block text-gray-400 mb-2 font-semibold' }, '來源 State'),
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
                                            const elem = { type: 'node', data: node };
                                            onSelect(elem);
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
                                            'ID: ' + node.id
                                        )
                                    )
                                )
                            )
                        ),
                        // 結束 (Target) State
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
                                            const elem = { type: 'node', data: node };
                                            onSelect(elem);
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
                                            'ID: ' + node.id
                                        )
                                    )
                                )
                            )
                        )
                    ]
                )
            );
        };

        function Editor({ initialData, initialSettings }) {
            const [nodes, setNodes] = useState(initialData?.nodes || []);
            const [edges, setEdges] = useState(initialData?.edges || []);
            const [selectedElement, setSelectedElement] = useState(null);
            const [settings, setSettings] = useState(initialSettings || { showDebugInfo: true });
            useEffect(() => {
                const handleMessage = (event) => {
                    const message = event.data;
                    if (message.command === 'updateSettings') {
                        setSettings(prev => ({ ...prev, ...message.settings }));
                    }
                };
                window.addEventListener('message', handleMessage);
                return () => window.removeEventListener('message', handleMessage);
            }, []);

            // 側邊欄寬度與收摺狀態
            const [panelWidth, setPanelWidth] = useState(320); 
            const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
            const [isResizing, setIsResizing] = useState(false);

            const startResizing = useCallback(() => setIsResizing(true), []);
            const stopResizing = useCallback(() => setIsResizing(false), []);
            const resize = useCallback((e) => {
                if (isResizing) {
                    const newWidth = window.innerWidth - e.clientX;
                    // 限制最小 200px, 最大 800px
                    if (newWidth > 200 && newWidth < 800) {
                        setPanelWidth(newWidth);
                    }
                }
            }, [isResizing]);

            useEffect(() => {
                if (isResizing) {
                    window.addEventListener('mousemove', resize);
                    window.addEventListener('mouseup', stopResizing);
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                } else {
                    window.removeEventListener('mousemove', resize);
                    window.removeEventListener('mouseup', stopResizing);
                    document.body.style.cursor = 'default';
                    document.body.style.userSelect = 'auto';
                }
                return () => {
                    window.removeEventListener('mousemove', resize);
                    window.removeEventListener('mouseup', stopResizing);
                };
            }, [isResizing, resize, stopResizing]);

            const idToNode = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

            const getAbsPos = useCallback((n) => {
                let x = n.position.x;
                let y = n.position.y;
                let pid = n.parentNode || (n.data && n.data.parentNode);
                let depth = 0;
                while(pid && depth < 20) {
                    const p = idToNode.get(pid);
                    if(!p) break;
                    x += p.position.x;
                    y += p.position.y;
                    pid = p.parentNode || (p.data && p.data.parentNode);
                    depth++;
                }
                return { x, y };
            }, [idToNode]);
            
            // 輔助函數：遞迴重新計算所有父節點的邊界 (Moved up to prevent ReferenceError)
            const recalculateBoundaries = useCallback((currentNodes) => {
                let newNodes = [...currentNodes];
                let anyChanges = false;
                let iterationLimit = 10; // 防止理論上的無限循環
                
                while (iterationLimit > 0) {
                    let loopChanges = false;
                    const parents = new Set(newNodes.filter(n => n.parentNode).map(n => n.parentNode));
                    
                    parents.forEach(parentId => {
                        const parentIdx = newNodes.findIndex(n => n.id === parentId);
                        if (parentIdx === -1) return;
                        
                        const parent = newNodes[parentIdx];
                        if (parent.data?.isCollapsed) return;

                        const directChildren = newNodes.filter(n => n.parentNode === parentId && !n.hidden);
                        if (directChildren.length === 0) return;

                        const hasLoops = parent.data?.loops && parent.data.loops.length > 0;
                        const padding = 24; // 邊界預留空間
                        const headerHeight = hasLoops ? 80 : 50; // 完全由 JS 控制的標題高度
                        
                        // 1. 檢查是否有子節點太靠近頂部 (遮擋標題或 Loops)
                        let minY = Infinity;
                        directChildren.forEach(child => {
                            minY = Math.min(minY, child.position.y);
                        });

                        // 如果最上方的子節點 y 座標小於 headerHeight，則需要下移所有子節點
                        if (minY < headerHeight) {
                            const offsetY = headerHeight - minY;
                            newNodes = newNodes.map(node => {
                                if (node.parentNode === parentId) {
                                    return { 
                                        ...node, 
                                        position: { ...node.position, y: node.position.y + offsetY } 
                                    };
                                }
                                return node;
                            });
                            loopChanges = true;
                            anyChanges = true;
                        }

                        // 2. 計算包含所有子節點所需的最小邊界
                        let maxX = 0;
                        let maxY = 0;

                        // 重新獲取最新的子節點 (可能已被上一步更新座標)
                        const updatedChildren = newNodes.filter(n => n.parentNode === parentId && !n.hidden);
                        updatedChildren.forEach(child => {
                            const cx = child.position.x;
                            const cy = child.position.y;
                            const cw = (child.width || 200);
                            const ch = (child.height || 50);
                            maxX = Math.max(maxX, cx + cw + padding);
                            maxY = Math.max(maxY, cy + ch + padding);
                        });
                        
                        // 確保最小寬高度
                        maxX = Math.max(maxX, 200);
                        maxY = Math.max(maxY, headerHeight + 40);

                        if (Math.abs((parent.width || 0) - maxX) > 1 || Math.abs((parent.height || 0) - maxY) > 1) {
                            newNodes[parentIdx] = {
                                ...parent,
                                width: maxX,
                                height: maxY,
                                style: {
                                    ...parent.style,
                                    width: maxX,
                                    height: maxY
                                }
                            };
                            loopChanges = true;
                            anyChanges = true;
                        }
                    });

                    if (!loopChanges) break;
                    iterationLimit--;
                }

                return { updatedNodes: newNodes, hasChanges: anyChanges };
            }, []);

            // 局部自動排版函數
            const layoutSubgraph = useCallback((parentId) => {
                setNodes((currentNodes) => {
                    // 1. 找出直系子節點
                    const directChildren = currentNodes.filter(n => n.parentNode === parentId && !n.hidden);
                    if (directChildren.length === 0) return currentNodes;

                    // 2. 找出相關連線 (兩端都在子節點集合中)
                    const childrenIds = new Set(directChildren.map(n => n.id));
                    const internalEdges = edges.filter(e => childrenIds.has(e.source) && childrenIds.has(e.target));

                    // 3. 建立臨時 Dagre Graph
                    const subGraph = new dagre.graphlib.Graph();
                    subGraph.setGraph({ 
                        rankdir: 'TB', 
                        nodesep: 50, 
                        ranksep: 50 
                    });
                    subGraph.setDefaultEdgeLabel(() => ({}));

                    directChildren.forEach(node => {
                        subGraph.setNode(node.id, { 
                            width: node.width || 200, 
                            height: node.height || 50 
                        });
                    });

                    internalEdges.forEach(edge => {
                        subGraph.setEdge(edge.source, edge.target);
                    });

                    // 4. 執行佈局
                    dagre.layout(subGraph);

                    // 5. 計算並更新位置
                    const parentNode = currentNodes.find(n => n.id === parentId);
                    const hasLoops = parentNode?.data?.loops && parentNode.data.loops.length > 0;
                    const headerOffset = hasLoops ? 80 : 50;
                    const paddingX = 24;

                    // 找出 Layout 結果的左上角偏移，將其歸零並加上 padding
                    let minLayoutX = Infinity;
                    let minLayoutY = Infinity;
                    
                    directChildren.forEach(node => {
                        const nodeWithPos = subGraph.node(node.id);
                        // Dagre 節點位置是中心點，需轉換為左上角
                        const x = nodeWithPos.x - (node.width || 200) / 2;
                        const y = nodeWithPos.y - (node.height || 50) / 2;
                        minLayoutX = Math.min(minLayoutX, x);
                        minLayoutY = Math.min(minLayoutY, y);
                    });

                    const newNodes = currentNodes.map(node => {
                        if (childrenIds.has(node.id)) {
                            const res = subGraph.node(node.id);
                            // 轉換中心點至左上角，並校正相對位置
                            const x = res.x - (node.width || 200) / 2 - minLayoutX + paddingX;
                            const y = res.y - (node.height || 50) / 2 - minLayoutY + headerOffset;
                            
                            return {
                                ...node,
                                position: { x, y }
                            };
                        }
                        return node;
                    });

                    // 確保觸發邊界重算
                    const result = recalculateBoundaries(newNodes);
                    return result.updatedNodes;
                });
            }, [edges, recalculateBoundaries]);

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

            // 處理自循環邊的層級和標籤位置，並為所有邊添加座標，同時隱藏收摺節點的連線
            const processedEdges = useMemo(() => {
                // 找出所有被收摺節點的 ID 集合
                const collapsedParents = new Set(nodes.filter(n => n.data?.isCollapsed).map(n => n.id));

                // 建立 ID -> ParentID 的映射以計算深度
                const parentMap = new Map();
                nodes.forEach(n => {
                    if (n.parentNode) parentMap.set(n.id, n.parentNode);
                });

                // 1. 計算平行邊 (相同 Start/End) 的數量
                const parallelEdgeCounts = new Map();
                edges.forEach(e => {
                    if (e.source !== e.target) {
                        const key = e.source + '-' + e.target;
                        parallelEdgeCounts.set(key, (parallelEdgeCounts.get(key) || 0) + 1);
                    }
                });
                const parallelEdgeIndices = new Map();

                // 輔助函數：計算節點深度
                const getNodeDepth = (nodeId) => {
                    let depth = 0;
                    let currentId = nodeId;
                    while (currentId && parentMap.has(currentId)) {
                        depth++;
                        currentId = parentMap.get(currentId);
                        if (depth > 100) break;
                    }
                    return depth;
                };
                
                return edges.map(edge => {
                    // 找到 source 和 target 節點
                    const sourceNode = idToNode.get(edge.source);
                    const targetNode = idToNode.get(edge.target);
                    
                    if (edge.source === edge.target) {
                        return null; 
                    }

                    // 如果 source 或 target 的 parent 被收摺，則隱藏此邊
                    let isHidden = false;
                    if (sourceNode && sourceNode.parentNode && collapsedParents.has(sourceNode.parentNode)) isHidden = true;
                    if (targetNode && targetNode.parentNode && collapsedParents.has(targetNode.parentNode)) isHidden = true;

                    // 計算 Edge 的 zIndex
                    const sourceDepth = sourceNode ? getNodeDepth(sourceNode.id) : 0;
                    const targetDepth = targetNode ? getNodeDepth(targetNode.id) : 0;
                    const edgeZIndex = Math.max(sourceDepth, targetDepth) + 1;

                    // 平行邊處理 logic
                    const key = edge.source + '-' + edge.target;
                    const count = parallelEdgeCounts.get(key) || 0;
                    const index = parallelEdgeIndices.get(key) || 0;
                    parallelEdgeIndices.set(key, index + 1);

                    let curvature = 0.2; // 預設曲率 (React Flow Default)
                    let labelYOffset = 0;

                    if (count > 1) {
                         // 對稱分佈曲率: (index - center) * gap
                         const gap = 0.25; 
                         const center = (count - 1) / 2;
                         curvature = 0.2 + (index - center) * gap;
                         
                         // 標籤 Y 軸錯開 (Pixel)
                         // 讓標籤跟隨線條上下移動，避免重疊
                         labelYOffset = (index - center) * 20; 
                    }

                    const originalLabel = edge.data?.label || edge.label || '';
                    return {
                        ...edge,
                        type: 'custom', // 使用自定義 Edge
                        label: originalLabel,
                        hidden: isHidden,
                        zIndex: edgeZIndex,
                        data: {
                            ...edge.data,
                            label: originalLabel,
                            curvature: curvature 
                        },
                        labelStyle: {
                            ...edge.labelStyle, 
                            transform: 'translateY(' + labelYOffset + 'px)', // 使用字串連接
                            fontSize: '11px',
                            fontWeight: 500,
                            fill: '#cbd5e1' // 確保標籤顏色清晰
                        }
                    };
                }).filter(Boolean);
            }, [edges, nodes, idToNode]);

            // 為 State 節點添加座標到標籤，並同步實際測量尺寸，同時處理收摺隱藏
            const processedNodes = useMemo(() => {
                // 找出所有被收摺節點的 ID 集合
                const collapsedParents = new Set(nodes.filter(n => n.data?.isCollapsed).map(n => n.id));

                // 建立 ID -> ParentID 的映射以計算深度
                const parentMap = new Map();
                nodes.forEach(n => {
                    if (n.parentNode) parentMap.set(n.id, n.parentNode);
                });

                return nodes.map(node => {
                    // 如果 parent 被收摺，則隱藏此節點
                    const isHidden = node.parentNode && collapsedParents.has(node.parentNode);

                    // 計算深度以決定 zIndex
                    let depth = 0;
                    let currentParent = node.parentNode;
                    while (currentParent) {
                        depth++;
                        currentParent = parentMap.get(currentParent);
                        if (depth > 100) break; // 防止死循環防護
                    }

                    const measuredWidth = node.measured?.width || node.width;
                    const measuredHeight = node.measured?.height || node.height;
                    const w = measuredWidth || (node.data?.isCollapsed ? 120 : 200);
                    const h = measuredHeight || (node.data?.isCollapsed ? 40 : 50);
                    
                    return {
                        ...node,
                        hidden: isHidden,
                        zIndex: depth + 1, // 深度越深，zIndex 越高，確保子節點顯示在父節點之上
                        // 同步測量尺寸到直接屬性，供 MiniMap 使用
                        width: w,
                        height: h,
                        style: {
                            ...node.style,
                            width: w,
                            height: h,
                            opacity: node.data?.isCollapsed ? 0.7 : 1,
                            zIndex: depth + 1 // 將 zIndex 也應用於 style
                        },
                        data: {
                            ...node.data,
                            label: (node.data?.label || node.id || '').replace(/\s*\(\d+,\s*\d+\)$/, ''),
                            onToggleCollapse: (nodeId) => {
                                setNodes(nds => nds.map(n => {
                                    if (n.id === nodeId) {
                                        return { ...n, data: { ...n.data, isCollapsed: !n.data.isCollapsed } };
                                    }
                                    return n;
                                }));
                            },
                            onLayoutChildren: layoutSubgraph 
                        }
                    };
                }).filter(Boolean);
            }, [nodes, getAbsPos, layoutSubgraph]);


            const onNodesChange = useCallback(
                (changes) => setNodes((nds) => {
                    const updatedNodes = applyNodeChanges(changes, nds);
                    
                    // 偵測移動或尺寸變更
                    const needsCheck = changes.some(c => 
                        (c.type === 'position' && c.dragging) || 
                        (c.type === 'dimensions')
                    );

                    if (needsCheck) {
                        const result = recalculateBoundaries(updatedNodes);
                        if (result.hasChanges) return result.updatedNodes;
                    }

                    // 同步測量尺寸
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
                [recalculateBoundaries]
            );

            // 初始載入時校準邊界
            useEffect(() => {
                if (nodes.length > 0) {
                    const result = recalculateBoundaries(nodes);
                    if (result.hasChanges) {
                        setNodes(result.updatedNodes);
                    }
                }
            }, []);
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
                    
                    // 正規化座標：讓圖形左上角對齊 (0, 0)
                    if (clonedNodes.length > 0) {
                        const localMap = new Map(clonedNodes.map(n => [n.id, n]));
                        const getLocalAbsPos = (n) => {
                            let x = n.position.x;
                            let y = n.position.y;
                            let pid = n.parentNode || (n.data && n.data.parentNode);
                            let depth = 0;
                            while(pid && depth < 20) {
                                const p = localMap.get(pid);
                                if(!p) break;
                                x += p.position.x;
                                y += p.position.y;
                                pid = p.parentNode || (p.data && p.data.parentNode);
                                depth++;
                            }
                            return { x, y };
                        };

                        let minX = Infinity, minY = Infinity;
                        let maxX = -Infinity, maxY = -Infinity;
                        
                        clonedNodes.forEach(node => {
                            const { x, y } = getLocalAbsPos(node);
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
                            // 僅偏移頂層節點，子節點會隨父節點移動
                            if (!node.parentNode && !(node.data && node.data.parentNode)) {
                                node.position.x -= offsetX;
                                node.position.y -= offsetY;
                            }
                            
                            // 強制更新位置緩存
                            nodePositionsCache.current.set(node.id, { ...node });
                        });
                    }
                    
                    // 佈局後強制重新計算邊界，確保父節點完整包含子節點
                    const layoutBoundariesResult = recalculateBoundaries(clonedNodes);
                    const finalizedNodes = layoutBoundariesResult.updatedNodes;
                    
                    setNodes(finalizedNodes);
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
                        
                        // 1. 畫布尺寸與中心 (像素座標)
                        const vw = rect.width;
                        const vh = rect.height;
                        const cx = vw / 2;
                        const cy = vh / 2;
                        
                        // 2. 畫布光標 (相對容器像素)
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
                                const { x, y } = getAbsPos(n);
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
                            const { x, y } = getAbsPos(node);
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


                
                
                // 計算整個 Diagram 的尺寸 (完全基於絕對座標)
                const diagramSize = useMemo(() => {
                    if (nodes.length === 0) return { w: 0, h: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
                    
                    let minX = Infinity, minY = Infinity;
                    let maxX = -Infinity, maxY = -Infinity;
                    
                    nodes.forEach(node => {
                        // 調用組件層級的 getAbsPos 取得絕對座標
                        const { x, y } = getAbsPos(node);
                        // 優先使用同步後的 width/height 屬性
                        const w = node.width ?? node.measured?.width ?? (node.style?.width ? parseInt(node.style.width.toString()) : 0) ?? 200;
                        const h = node.height ?? node.measured?.height ?? (node.style?.height ? parseInt(node.style.height.toString()) : 0) ?? 50;
                        
                        minX = Math.min(minX, x);
                        minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x + (w || 200));
                        maxY = Math.max(maxY, y + (h || 50));
                    });
                    
                    if (minX === Infinity) return { w: 0, h: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
                    
                    const calculatedW = Math.round(maxX - minX);
                    const calculatedH = Math.round(maxY - minY);
                    
                    return { w: calculatedW, h: calculatedH, minX: Math.round(minX), minY: Math.round(minY), maxX: Math.round(maxX), maxY: Math.round(maxY) };
                }, [nodes, getAbsPos]);

                // 顯示座標面板 (Debug Info)
                if (!settings.showDebugInfo) return null;

                return React.createElement(Panel, { position: 'top-right', className: 'bg-black/70 p-2 rounded text-xs font-mono pointer-events-none z-50' },
                    React.createElement('div', { className: 'text-yellow-400 mb-1' }, 'Canvas Center (' + cursorInfo.cx + ', ' + cursorInfo.cy + ')'),
                    React.createElement('div', { className: 'text-red-400 mb-1' }, 'Canvas Cursor (' + cursorInfo.vx + ', ' + cursorInfo.vy + ')'),
                    React.createElement('div', { className: 'text-orange-400 mb-1' }, 'Canvas Size (' + cursorInfo.vw + ', ' + cursorInfo.vh + ')'),
                    React.createElement('div', { className: 'text-green-400 mb-1' }, 'Diagram Cursor (' + cursorInfo.dx + ', ' + cursorInfo.dy + ')'),
                    React.createElement('div', { className: 'text-blue-400' }, 'Diagram Size (' + diagramSize.w + ', ' + diagramSize.h + ')')
                );
            }

            
            const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);

            return React.createElement('div', { className: 'flex w-full h-full relative overflow-hidden' },
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
                        edgeTypes: edgeTypes,
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
                                
                                // 獲取當前畫布資訊
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
                                
                                // 保留當前縮放比例，僅移動畫布中心
                                reactFlowInstance.setCenter(targetX, targetY, { zoom: viewport.zoom, duration: 800 });
                            }
                        }),
                        React.createElement(Panel, { position: 'top-left', className: 'bg-[#2d3748] p-2 rounded shadow-lg border border-[#4a5568]' },
                            React.createElement('button', { 
                                onClick: () => onLayout('TB', true),
                                className: 'bg-blue-600 hover:bg-blue-700 text-white w-8 h-8 rounded text-lg flex items-center justify-center transition-colors',
                                title: 'Auto Layout'
                            }, '⌖')
                        ),
                        // 導航提示面板
                        React.createElement(Panel, { position: 'bottom-center', className: 'bg-[#2d3748] p-2 rounded shadow-lg border border-[#4a5568] text-xs text-gray-400 mb-2' },
                            React.createElement('div', null, '🖱️ 拖曳平移 | 滾輪縮放 | 縮圖導航 (點擊跳轉)')
                        )
                    )
                ),
                // 屬性檢閱器 (Property Inspector)
                React.createElement(PropertyInspector, {
                    isCollapsed: isPanelCollapsed,
                    onToggleCollapse: setIsPanelCollapsed,
                    width: panelWidth,
                    onStartResizing: startResizing,
                    selectedElement: selectedElement,
                    data: { nodes, processedEdges },
                    onUpdate: onInputChange,
                    onSelect: (elem) => {
                        setSelectedElement(elem);
                        if (flowWrapperRef.focusElement) {
                            flowWrapperRef.focusElement(elem);
                        }
                    }
                })
            );
        }
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'init') {
                try {
                    // 用 ReactFlowProvider 包裹 Editor，讓 useReactFlow 能正確運作
                    root.render(
                        React.createElement(ReactFlowProvider, null,
                            React.createElement(Editor, { 
                                initialData: message.data, 
                                initialSettings: message.settings 
                            })
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
