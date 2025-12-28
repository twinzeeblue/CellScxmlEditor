import { ScxmlParser } from './scxml-parser';
import * as fs from 'fs';
import * as path from 'path';

const scxmlPath = '/Volumes/earth/Mix/Pal/Twin Blue/Projects/CellApps/MyGame_app_service.scxml';
const content = fs.readFileSync(scxmlPath, 'utf8');

const parser = new ScxmlParser();
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
} catch (error) {
    console.error('Parser Validation Failed:', error);
}
