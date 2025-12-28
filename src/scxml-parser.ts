import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export interface ScxmlNode {
    id: string;
    type: 'state' | 'parallel' | 'final' | 'initial';
    geometry?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    qtGeometry?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    onentry?: string;
    onexit?: string;
    children: ScxmlNode[];
    transitions: ScxmlTransition[];
}

export interface ScxmlTransition {
    event: string;
    target: string;
    cond?: string;
    type?: string;
    qtPoint?: { x: number, y: number };
}

export class ScxmlParser {
    private parser: XMLParser;
    private builder: XMLBuilder;

    constructor() {
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            parseAttributeValue: true
        });
        this.builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: "@_"
        });
    }

    public parse(xmlContent: string): ScxmlNode {
        const jsonObj = this.parser.parse(xmlContent);
        const root = jsonObj.scxml;

        // 遞迴解析狀態節點
        return this.parseState(root);
    }

    public toReactFlow(root: ScxmlNode): { nodes: any[], edges: any[] } {
        const nodes: any[] = [];
        const edges: any[] = [];

        const colors = ['#3182ce', '#38a169', '#d53f8c', '#805ad5', '#dd6b20', '#319795', '#e53e3e', '#d69e2e'];
        let colorIdx = 0;

        // 預掃描以計算每個節點的進出連線數，用於分配間距
        const sourceCounts: Map<string, number> = new Map();
        const targetCounts: Map<string, number> = new Map();
        const edgeTrack: Map<string, number> = new Map(); // 用於追踪當前分配到第幾個 handle

        const preScan = (node: ScxmlNode) => {
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

        const traverse = (node: ScxmlNode, parentId?: string) => {
            const borderColor = borderColors[nodeColorIdx % borderColors.length];
            nodeColorIdx++;

            const isCompound = node.children.length > 0;
            const flowNode: any = {
                id: node.id,
                type: isCompound ? 'compound' : node.type,
                data: {
                    label: node.id,
                    type: node.type,
                    isCompound: isCompound,
                    onentry: node.onentry,
                    onexit: node.onexit,
                    sourceCount: sourceCounts.get(node.id) || 0,
                    targetCount: targetCounts.get(node.id) || 0,
                    borderColor: borderColor,
                    qtGeometry: node.qtGeometry
                },
                position: node.geometry ? { x: node.geometry.x, y: node.geometry.y } : { x: 0, y: 0 },
                className: `scxml-${isCompound ? 'compound' : node.type}`
            };

            if (parentId) {
                flowNode.parentNode = parentId;
                flowNode.extent = 'parent';
            }

            nodes.push(flowNode);

            // 處理 edges
            const loops: any[] = [];
            for (const t of node.transitions) {
                if (t.target) {
                    // 偵測自循環
                    if (t.target === node.id) {
                        loops.push({
                            event: t.event,
                            cond: t.cond,
                            type: t.type,
                            qtPoint: t.qtPoint
                        });
                        continue;
                    }

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

            flowNode.data.loops = loops;

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

    public stringify(root: ScxmlNode): string {
        const scxmlObj = {
            scxml: this.serializeState(root, true)
        };
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + this.builder.build(scxmlObj);
    }

    public updateFromFlow(root: ScxmlNode, nodes: any[], edges: any[]): ScxmlNode {
        // 更新節點幾何資訊與邏輯屬性
        const updateNodeData = (node: ScxmlNode) => {
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
            } else {
                // 如果找不到對應的 flowNode，可能該節點是隱藏的或是根節點
                // 這裡可以選擇不更新或進行默認處理
            }

            // 更新此節點的出點連線 (Transitions)
            const updatedTransitions: ScxmlTransition[] = [];

            // 1. 處理自循環 (Loops)
            if (flowNode && flowNode.data?.loops && Array.isArray(flowNode.data.loops)) {
                for (const loop of flowNode.data.loops) {
                    updatedTransitions.push({
                        event: loop.event,
                        target: node.id,
                        cond: loop.cond,
                        type: loop.type,
                        qtPoint: loop.qtPoint
                    });
                }
            }

            // 2. 處理外部連線 (Edges)
            for (const trans of node.transitions) {
                // 跳過原本是自循環的部分，我們已經在上面處理過最新的了
                if (trans.target === node.id) continue;

                const matchedEdge = edges.find(e => e.source === node.id && e.target === trans.target);
                if (matchedEdge) {
                    updatedTransitions.push({
                        ...trans,
                        event: matchedEdge.label || trans.event,
                        cond: matchedEdge.cond || trans.cond
                    });
                } else {
                    // 如果找不到對應的 edge 且不是自循環，保持原樣 (可能是 parser 尚未掃描到的邊)
                    updatedTransitions.push(trans);
                }
            }

            node.transitions = updatedTransitions;
            node.children.forEach(updateNodeData);
        };

        updateNodeData(root);
        return root;
    }

    private serializeState(node: ScxmlNode, isRoot: boolean = false): any {
        const obj: any = {
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

    private parseState(element: any): ScxmlNode {
        const id = element["@_id"] || element["@_name"] || "root";
        const node: ScxmlNode = {
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
            let qtPoint: { x: number, y: number } | undefined;

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
