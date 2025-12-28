"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const scxml_parser_1 = require("./scxml-parser");
const fs = __importStar(require("fs"));
const scxmlPath = '/Volumes/earth/Mix/Pal/Twin Blue/Projects/CellApps/MyGame_app_service.scxml';
const content = fs.readFileSync(scxmlPath, 'utf8');
const parser = new scxml_parser_1.ScxmlParser();
try {
    const result = parser.parse(content);
    console.log('--- Parser Validation Success ---');
    console.log('Root ID:', result.id);
    const flowData = parser.toReactFlow(result);
    console.log('React Flow Nodes:', flowData.nodes.length);
    // 模擬修改第一個節點的座標
    if (flowData.nodes.length > 0) {
        flowData.nodes[0].position.x += 100;
        console.log('Modified Position:', JSON.stringify(flowData.nodes[0].position));
    }
    const updatedResult = parser.updateFromFlow(result, flowData.nodes, flowData.edges);
    const newXml = parser.stringify(updatedResult);
    console.log('--- Generated XML Preview ---');
    console.log(newXml.slice(0, 500));
    console.log('--- End Preview ---');
}
catch (error) {
    console.error('Parser Validation Failed:', error);
}
//# sourceMappingURL=test-parser.js.map