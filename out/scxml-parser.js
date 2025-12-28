"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScxmlParser = void 0;
const fast_xml_parser_1 = require("fast-xml-parser");
class ScxmlParser {
    constructor() {
        this.parser = new fast_xml_parser_1.XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            parseAttributeValue: true
        });
        this.builder = new fast_xml_parser_1.XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: "@_"
        });
    }
    parse(xmlContent) {
        const jsonObj = this.parser.parse(xmlContent);
        const root = jsonObj.scxml;
        // 遞迴解析狀態節點
        return this.parseState(root);
    }
    toReactFlow(root) {
        const nodes = [];
        const edges = [];
        const colors = ['#3182ce', '#38a169', '#d53f8c', '#805ad5', '#dd6b20', '#319795', '#e53e3e', '#d69e2e'];
        let colorIdx = 0;
        // 預掃描以計算每個節點的進出連線數，用於分配間距
        const sourceCounts = new Map();
        const targetCounts = new Map();
        const edgeTrack = new Map(); // 用於追踪當前分配到第幾個 handle
        const preScan = (node) => {
            for (const t of node.transitions) {
                if (t.target) {
                    sourceCounts.set(node.id, (sourceCounts.get(node.id) || 0) + 1);
                    targetCounts.set(t.target, (targetCounts.get(t.target) || 0) + 1);
                }
            }
            node.children.forEach(preScan);
        };
        preScan(root);
        const borderColors = ['#4299e1', '#48bb78', '#ed64a6', '#9f7aea', '#ed8936', '#38b2ac', '#f56565', '#ecc94b'];
        let nodeColorIdx = 0;
        const traverse = (node, parentId) => {
            const borderColor = borderColors[nodeColorIdx % borderColors.length];
            nodeColorIdx++;
            const flowNode = {
                id: node.id,
                type: node.type,
                data: {
                    label: node.id,
                    type: node.type,
                    onentry: node.onentry,
                    onexit: node.onexit,
                    sourceCount: sourceCounts.get(node.id) || 0,
                    targetCount: targetCounts.get(node.id) || 0,
                    borderColor: borderColor,
                    qtGeometry: node.qtGeometry
                },
                position: node.geometry ? { x: node.geometry.x, y: node.geometry.y } : { x: 0, y: 0 },
                className: `scxml-${node.type}`
            };
            if (parentId) {
                flowNode.parentNode = parentId;
                flowNode.extent = 'parent';
            }
            nodes.push(flowNode);
            // 處理 edges
            for (const t of node.transitions) {
                if (t.target) {
                    const color = colors[colorIdx % colors.length];
                    colorIdx++;
                    // 計算 handle 的偏移順序
                    const sOrder = (edgeTrack.get(`s-${node.id}`) || 0) + 1;
                    const tOrder = (edgeTrack.get(`t-${t.target}`) || 0) + 1;
                    edgeTrack.set(`s-${node.id}`, sOrder);
                    edgeTrack.set(`t-${t.target}`, tOrder);
                    edges.push({
                        id: `e-${node.id}-${t.target}-${t.event || 'empty'}-${sOrder}`,
                        source: node.id,
                        target: t.target,
                        label: t.event,
                        type: 'step',
                        animated: true,
                        // 雖然 React Flow 預設沒有多 handle，但透過 sourceHandle/targetHandle 字串
                        // 配合自定義節點或 CSS 可以實現視覺上的偏移，或直接讓佈局引擎處理。
                        // 在標準 React Flow 中，這會影響連線落點計算。
                        sourceHandle: `s-${sOrder}`,
                        targetHandle: `t-${tOrder}`,
                        markerEnd: { type: 'arrowclosed', color: color },
                        style: { stroke: color, strokeWidth: 2 },
                        labelStyle: { fill: color, fontWeight: 800, fontSize: 13 },
                        labelBgStyle: { fill: '#2d3748', fillOpacity: 0.95 },
                        labelBgPadding: [6, 3],
                        labelBgBorderRadius: 4,
                        data: {
                            label: t.event,
                            qtPoint: t.qtPoint
                        }
                    });
                }
            }
            // 遞迴子節點
            for (const child of node.children) {
                traverse(child, node.id);
            }
        };
        // 從 root 的子節點開始（排除 root 自身，因為 SCXML root 是容器）
        for (const child of root.children) {
            traverse(child);
        }
        return { nodes, edges };
    }
    stringify(root) {
        const scxmlObj = {
            scxml: this.serializeState(root, true)
        };
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + this.builder.build(scxmlObj);
    }
    updateFromFlow(root, nodes, edges) {
        // 更新節點幾何資訊與邏輯屬性
        const updateNodeData = (node) => {
            const flowNode = nodes.find(n => n.id === node.id);
            if (flowNode) {
                if (flowNode.position) {
                    node.geometry = {
                        x: flowNode.position.x,
                        y: flowNode.position.y,
                        width: flowNode.style?.width || node.geometry?.width || 100,
                        height: flowNode.style?.height || node.geometry?.height || 100
                    };
                }
                // 同步腳本內容
                node.onentry = flowNode.data?.onentry;
                node.onexit = flowNode.data?.onexit;
            }
            // 更新此節點的出點連線 (Transitions)
            for (const trans of node.transitions) {
                // 優先比對 source 與 target
                const matchedEdge = edges.find(e => e.source === node.id && e.target === trans.target);
                if (matchedEdge) {
                    trans.event = matchedEdge.label || trans.event;
                    trans.cond = matchedEdge.cond || trans.cond;
                }
            }
            node.children.forEach(updateNodeData);
        };
        updateNodeData(root);
        return root;
    }
    serializeState(node, isRoot = false) {
        const obj = {
            "@_id": node.id,
        };
        if (node.geometry) {
            obj["qt:editorinfo"] = {
                "@_geometry": `${node.geometry.x.toFixed(2)};${node.geometry.y.toFixed(2)};-20;-20;${node.geometry.width};${node.geometry.height}`
            };
        }
        if (node.onentry) {
            obj.onentry = { script: node.onentry };
        }
        if (node.onexit) {
            obj.onexit = { script: node.onexit };
        }
        if (node.children.length > 0) {
            obj.state = node.children.map(c => this.serializeState(c));
        }
        if (node.transitions.length > 0) {
            obj.transition = node.transitions.map(t => ({
                "@_event": t.event,
                "@_target": t.target,
                "@_cond": t.cond,
                "@_type": t.type
            }));
        }
        // 特別處理 root 專有的屬性
        if (isRoot) {
            return {
                "@_xmlns": "http://www.w3.org/2005/07/scxml",
                "@_version": "1.0",
                "@_name": node.id,
                ...obj
            };
        }
        return obj;
    }
    parseState(element) {
        const id = element["@_id"] || element["@_name"] || "root";
        const node = {
            id,
            type: element.final ? 'final' : (element.parallel ? 'parallel' : 'state'),
            children: [],
            transitions: []
        };
        // 解析 geometry (Qt 特有標籤)
        if (element["qt:editorinfo"]) {
            const geoStr = element["qt:editorinfo"]["@_geometry"] || element["qt:editorinfo"]["@_scenegeometry"];
            if (geoStr) {
                const parts = geoStr.split(';');
                const geo = {
                    x: parseFloat(parts[0]),
                    y: parseFloat(parts[1]),
                    width: parseFloat(parts[4]) || 100,
                    height: parseFloat(parts[5]) || 100
                };
                node.geometry = { ...geo };
                node.qtGeometry = { ...geo };
            }
        }
        // 解析 onentry/onexit
        if (element.onentry) {
            node.onentry = element.onentry.script || (Array.isArray(element.onentry) ? element.onentry[0].script : "");
        }
        if (element.onexit) {
            node.onexit = element.onexit.script || (Array.isArray(element.onexit) ? element.onexit[0].script : "");
        }
        // 遞迴解析子狀態
        const states = Array.isArray(element.state) ? element.state : (element.state ? [element.state] : []);
        for (const s of states) {
            node.children.push(this.parseState(s));
        }
        // 解析 transitions
        const transitions = Array.isArray(element.transition) ? element.transition : (element.transition ? [element.transition] : []);
        for (const t of transitions) {
            const eventStr = t["@_event"] || "";
            let qtPoint;
            // 嘗試從 event 字串中提取座標
            const match = eventStr.match(/\s*\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)$/);
            if (match) {
                qtPoint = {
                    x: parseFloat(match[1]),
                    y: parseFloat(match[2])
                };
            }
            node.transitions.push({
                event: eventStr,
                target: t["@_target"],
                cond: t["@_cond"],
                type: t["@_type"],
                qtPoint: qtPoint
            });
        }
        return node;
    }
}
exports.ScxmlParser = ScxmlParser;
//# sourceMappingURL=scxml-parser.js.map