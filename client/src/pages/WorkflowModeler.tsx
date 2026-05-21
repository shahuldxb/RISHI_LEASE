/**
 * VodaLease Enterprise — BPMN Process Modeler (Camunda-style)
 * Uses an iframe pointing to /api/bpmn-modeler to host bpmn-js outside React/Vite.
 * Communication between React and the iframe is via postMessage.
 * Screen ID: VFWKFMODS0004P001
 */
import { useEffect, useRef, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Save, Play, Download, Upload, GitBranch, ZoomIn, ZoomOut,
  Maximize2, RotateCcw, FileText, Layers, Settings2,
  ChevronRight, ChevronLeft, AlignCenter, Grid3X3, Info
} from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/ScreenHeader";
import { trpc } from "@/lib/trpc";

/* ─── Process templates ─── */
const PROCESS_TEMPLATES = [
  { id: "blank",             name: "Blank Process" },
  { id: "lease_approval",    name: "Lease Approval Workflow" },
  { id: "invoice_approval",  name: "Invoice Approval Workflow" },
  { id: "payment_run",       name: "Payment Run Workflow" },
  { id: "lease_renewal",     name: "Lease Renewal Workflow" },
  { id: "lease_termination", name: "Lease Termination Workflow" },
  { id: "maker_checker",     name: "Maker / Checker Workflow" },
];

/* ─── BPMN XML templates ─── */
const TEMPLATES: Record<string, string> = {
  blank: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_blank" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_blank" isExecutable="true">
    <bpmn:startEvent id="Start_1" name="Start"><bpmn:outgoing>Flow_1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:endEvent id="End_1" name="End"><bpmn:incoming>Flow_1</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="End_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_blank">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1"><dc:Bounds x="172" y="192" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="175" y="235" width="30" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_1_di" bpmnElement="End_1"><dc:Bounds x="372" y="192" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="379" y="235" width="23" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="208" y="210"/><di:waypoint x="372" y="210"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,

  lease_approval: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_LA" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_LeaseApproval" name="Lease Approval" isExecutable="true">
    <bpmn:startEvent id="SE_1" name="Lease Submitted"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="UT_Maker" name="Maker: Complete Lease Form"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:userTask>
    <bpmn:exclusiveGateway id="GW_Threshold" name="Above Threshold?"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F3</bpmn:outgoing><bpmn:outgoing>F4</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:userTask id="UT_L1" name="L1 Checker: Review"><bpmn:incoming>F3</bpmn:incoming><bpmn:outgoing>F5</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="UT_L2" name="L2 Checker: Approve"><bpmn:incoming>F4</bpmn:incoming><bpmn:outgoing>F6</bpmn:outgoing></bpmn:userTask>
    <bpmn:exclusiveGateway id="GW_Merge" name="Merge"><bpmn:incoming>F5</bpmn:incoming><bpmn:incoming>F6</bpmn:incoming><bpmn:outgoing>F7</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:serviceTask id="ST_GL" name="Post IFRS 16 GL Entries"><bpmn:incoming>F7</bpmn:incoming><bpmn:outgoing>F8</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:endEvent id="EE_1" name="Lease Active"><bpmn:incoming>F8</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="SE_1" targetRef="UT_Maker"/>
    <bpmn:sequenceFlow id="F2" sourceRef="UT_Maker" targetRef="GW_Threshold"/>
    <bpmn:sequenceFlow id="F3" name="≤ Threshold" sourceRef="GW_Threshold" targetRef="UT_L1"/>
    <bpmn:sequenceFlow id="F4" name="&gt; Threshold" sourceRef="GW_Threshold" targetRef="UT_L2"/>
    <bpmn:sequenceFlow id="F5" sourceRef="UT_L1" targetRef="GW_Merge"/>
    <bpmn:sequenceFlow id="F6" sourceRef="UT_L2" targetRef="GW_Merge"/>
    <bpmn:sequenceFlow id="F7" sourceRef="GW_Merge" targetRef="ST_GL"/>
    <bpmn:sequenceFlow id="F8" sourceRef="ST_GL" targetRef="EE_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_LA">
    <bpmndi:BPMNPlane id="BPMNPlane_LA" bpmnElement="Process_LeaseApproval">
      <bpmndi:BPMNShape id="SE_1_di" bpmnElement="SE_1"><dc:Bounds x="152" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_Maker_di" bpmnElement="UT_Maker"><dc:Bounds x="240" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="GW_Threshold_di" bpmnElement="GW_Threshold" isMarkerVisible="true"><dc:Bounds x="395" y="185" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_L1_di" bpmnElement="UT_L1"><dc:Bounds x="500" y="100" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_L2_di" bpmnElement="UT_L2"><dc:Bounds x="500" y="250" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="GW_Merge_di" bpmnElement="GW_Merge" isMarkerVisible="true"><dc:Bounds x="655" y="185" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_GL_di" bpmnElement="ST_GL"><dc:Bounds x="760" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE_1_di" bpmnElement="EE_1"><dc:Bounds x="922" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="188" y="210"/><di:waypoint x="240" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="340" y="210"/><di:waypoint x="395" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F3_di" bpmnElement="F3"><di:waypoint x="420" y="185"/><di:waypoint x="420" y="140"/><di:waypoint x="500" y="140"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F4_di" bpmnElement="F4"><di:waypoint x="420" y="235"/><di:waypoint x="420" y="290"/><di:waypoint x="500" y="290"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F5_di" bpmnElement="F5"><di:waypoint x="600" y="140"/><di:waypoint x="680" y="140"/><di:waypoint x="680" y="185"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F6_di" bpmnElement="F6"><di:waypoint x="600" y="290"/><di:waypoint x="680" y="290"/><di:waypoint x="680" y="235"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F7_di" bpmnElement="F7"><di:waypoint x="705" y="210"/><di:waypoint x="760" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F8_di" bpmnElement="F8"><di:waypoint x="860" y="210"/><di:waypoint x="922" y="210"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,

  maker_checker: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_MC" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_MakerChecker" name="Maker Checker" isExecutable="true">
    <bpmn:startEvent id="SE_MC" name="Request Submitted"><bpmn:outgoing>F_MC1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="UT_MC_Maker" name="Maker: Prepare &amp; Submit"><bpmn:incoming>F_MC1</bpmn:incoming><bpmn:outgoing>F_MC2</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="UT_MC_Checker" name="Checker: Review &amp; Decide"><bpmn:incoming>F_MC2</bpmn:incoming><bpmn:incoming>F_MC7</bpmn:incoming><bpmn:outgoing>F_MC3</bpmn:outgoing></bpmn:userTask>
    <bpmn:exclusiveGateway id="GW_MC_Decision" name="Approved?"><bpmn:incoming>F_MC3</bpmn:incoming><bpmn:outgoing>F_MC4</bpmn:outgoing><bpmn:outgoing>F_MC5</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:serviceTask id="ST_MC_Post" name="Post Transaction"><bpmn:incoming>F_MC4</bpmn:incoming><bpmn:outgoing>F_MC6</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="UT_MC_Rework" name="Maker: Rework &amp; Resubmit"><bpmn:incoming>F_MC5</bpmn:incoming><bpmn:outgoing>F_MC7</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="EE_MC_OK" name="Approved"><bpmn:incoming>F_MC6</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F_MC1" sourceRef="SE_MC" targetRef="UT_MC_Maker"/>
    <bpmn:sequenceFlow id="F_MC2" sourceRef="UT_MC_Maker" targetRef="UT_MC_Checker"/>
    <bpmn:sequenceFlow id="F_MC3" sourceRef="UT_MC_Checker" targetRef="GW_MC_Decision"/>
    <bpmn:sequenceFlow id="F_MC4" name="Yes" sourceRef="GW_MC_Decision" targetRef="ST_MC_Post"/>
    <bpmn:sequenceFlow id="F_MC5" name="No – Return" sourceRef="GW_MC_Decision" targetRef="UT_MC_Rework"/>
    <bpmn:sequenceFlow id="F_MC6" sourceRef="ST_MC_Post" targetRef="EE_MC_OK"/>
    <bpmn:sequenceFlow id="F_MC7" sourceRef="UT_MC_Rework" targetRef="UT_MC_Checker"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_MC">
    <bpmndi:BPMNPlane id="BPMNPlane_MC" bpmnElement="Process_MakerChecker">
      <bpmndi:BPMNShape id="SE_MC_di" bpmnElement="SE_MC"><dc:Bounds x="152" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_MC_Maker_di" bpmnElement="UT_MC_Maker"><dc:Bounds x="240" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_MC_Checker_di" bpmnElement="UT_MC_Checker"><dc:Bounds x="400" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="GW_MC_Decision_di" bpmnElement="GW_MC_Decision" isMarkerVisible="true"><dc:Bounds x="555" y="185" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_MC_Post_di" bpmnElement="ST_MC_Post"><dc:Bounds x="660" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_MC_Rework_di" bpmnElement="UT_MC_Rework"><dc:Bounds x="555" y="310" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE_MC_OK_di" bpmnElement="EE_MC_OK"><dc:Bounds x="822" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="F_MC1_di" bpmnElement="F_MC1"><di:waypoint x="188" y="210"/><di:waypoint x="240" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_MC2_di" bpmnElement="F_MC2"><di:waypoint x="340" y="210"/><di:waypoint x="400" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_MC3_di" bpmnElement="F_MC3"><di:waypoint x="500" y="210"/><di:waypoint x="555" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_MC4_di" bpmnElement="F_MC4"><di:waypoint x="605" y="210"/><di:waypoint x="660" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_MC5_di" bpmnElement="F_MC5"><di:waypoint x="580" y="235"/><di:waypoint x="580" y="310"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_MC6_di" bpmnElement="F_MC6"><di:waypoint x="760" y="210"/><di:waypoint x="822" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F_MC7_di" bpmnElement="F_MC7"><di:waypoint x="555" y="350"/><di:waypoint x="450" y="350"/><di:waypoint x="450" y="250"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,

  lease_termination: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_LT" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_LeaseTermination" name="Lease Termination" isExecutable="true">
    <bpmn:startEvent id="SE_LT" name="Termination Requested"><bpmn:outgoing>FLT1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:serviceTask id="ST_LT_Penalty" name="Compute Penalty vs Buyout"><bpmn:incoming>FLT1</bpmn:incoming><bpmn:outgoing>FLT2</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="UT_LT_Maker" name="Maker: Initiate Termination"><bpmn:incoming>FLT2</bpmn:incoming><bpmn:outgoing>FLT3</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="UT_LT_Checker" name="Checker: Approve Termination"><bpmn:incoming>FLT3</bpmn:incoming><bpmn:outgoing>FLT4</bpmn:outgoing></bpmn:userTask>
    <bpmn:exclusiveGateway id="GW_LT_Dec" name="Decision"><bpmn:incoming>FLT4</bpmn:incoming><bpmn:outgoing>FLT5</bpmn:outgoing><bpmn:outgoing>FLT6</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:serviceTask id="ST_LT_GL" name="Post Derecognition GL"><bpmn:incoming>FLT5</bpmn:incoming><bpmn:outgoing>FLT7</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="UT_LT_MakeGood" name="Record Make-Good Settlement"><bpmn:incoming>FLT7</bpmn:incoming><bpmn:outgoing>FLT8</bpmn:outgoing></bpmn:userTask>
    <bpmn:endEvent id="EE_LT_OK" name="Lease Terminated"><bpmn:incoming>FLT8</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="EE_LT_Rej" name="Termination Rejected"><bpmn:incoming>FLT6</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="FLT1" sourceRef="SE_LT" targetRef="ST_LT_Penalty"/>
    <bpmn:sequenceFlow id="FLT2" sourceRef="ST_LT_Penalty" targetRef="UT_LT_Maker"/>
    <bpmn:sequenceFlow id="FLT3" sourceRef="UT_LT_Maker" targetRef="UT_LT_Checker"/>
    <bpmn:sequenceFlow id="FLT4" sourceRef="UT_LT_Checker" targetRef="GW_LT_Dec"/>
    <bpmn:sequenceFlow id="FLT5" name="Approved" sourceRef="GW_LT_Dec" targetRef="ST_LT_GL"/>
    <bpmn:sequenceFlow id="FLT6" name="Rejected" sourceRef="GW_LT_Dec" targetRef="EE_LT_Rej"/>
    <bpmn:sequenceFlow id="FLT7" sourceRef="ST_LT_GL" targetRef="UT_LT_MakeGood"/>
    <bpmn:sequenceFlow id="FLT8" sourceRef="UT_LT_MakeGood" targetRef="EE_LT_OK"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_LT">
    <bpmndi:BPMNPlane id="BPMNPlane_LT" bpmnElement="Process_LeaseTermination">
      <bpmndi:BPMNShape id="SE_LT_di" bpmnElement="SE_LT"><dc:Bounds x="152" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_LT_Penalty_di" bpmnElement="ST_LT_Penalty"><dc:Bounds x="240" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_LT_Maker_di" bpmnElement="UT_LT_Maker"><dc:Bounds x="400" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_LT_Checker_di" bpmnElement="UT_LT_Checker"><dc:Bounds x="560" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="GW_LT_Dec_di" bpmnElement="GW_LT_Dec" isMarkerVisible="true"><dc:Bounds x="715" y="185" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_LT_GL_di" bpmnElement="ST_LT_GL"><dc:Bounds x="820" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_LT_MakeGood_di" bpmnElement="UT_LT_MakeGood"><dc:Bounds x="980" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE_LT_OK_di" bpmnElement="EE_LT_OK"><dc:Bounds x="1142" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE_LT_Rej_di" bpmnElement="EE_LT_Rej"><dc:Bounds x="742" y="312" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="FLT1_di" bpmnElement="FLT1"><di:waypoint x="188" y="210"/><di:waypoint x="240" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLT2_di" bpmnElement="FLT2"><di:waypoint x="340" y="210"/><di:waypoint x="400" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLT3_di" bpmnElement="FLT3"><di:waypoint x="500" y="210"/><di:waypoint x="560" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLT4_di" bpmnElement="FLT4"><di:waypoint x="660" y="210"/><di:waypoint x="715" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLT5_di" bpmnElement="FLT5"><di:waypoint x="765" y="210"/><di:waypoint x="820" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLT6_di" bpmnElement="FLT6"><di:waypoint x="740" y="235"/><di:waypoint x="740" y="312"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLT7_di" bpmnElement="FLT7"><di:waypoint x="920" y="210"/><di:waypoint x="980" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLT8_di" bpmnElement="FLT8"><di:waypoint x="1080" y="210"/><di:waypoint x="1142" y="210"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,

  invoice_approval: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_IA" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_InvoiceApproval" name="Invoice Approval" isExecutable="true">
    <bpmn:startEvent id="SE_IA" name="Invoice Received"><bpmn:outgoing>FIA1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:serviceTask id="ST_IA_OCR" name="OCR: Extract Invoice Data"><bpmn:incoming>FIA1</bpmn:incoming><bpmn:outgoing>FIA2</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="UT_IA_Verify" name="AP: Verify &amp; Match PO"><bpmn:incoming>FIA2</bpmn:incoming><bpmn:outgoing>FIA3</bpmn:outgoing></bpmn:userTask>
    <bpmn:exclusiveGateway id="GW_IA_Match" name="3-Way Match?"><bpmn:incoming>FIA3</bpmn:incoming><bpmn:outgoing>FIA4</bpmn:outgoing><bpmn:outgoing>FIA5</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:userTask id="UT_IA_Approve" name="Finance: Approve Invoice"><bpmn:incoming>FIA4</bpmn:incoming><bpmn:outgoing>FIA6</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="UT_IA_Dispute" name="AP: Raise Dispute"><bpmn:incoming>FIA5</bpmn:incoming><bpmn:outgoing>FIA7</bpmn:outgoing></bpmn:userTask>
    <bpmn:serviceTask id="ST_IA_GL" name="Post AP Journal"><bpmn:incoming>FIA6</bpmn:incoming><bpmn:outgoing>FIA8</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:endEvent id="EE_IA_OK" name="Invoice Posted"><bpmn:incoming>FIA8</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="EE_IA_Disp" name="Disputed"><bpmn:incoming>FIA7</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="FIA1" sourceRef="SE_IA" targetRef="ST_IA_OCR"/>
    <bpmn:sequenceFlow id="FIA2" sourceRef="ST_IA_OCR" targetRef="UT_IA_Verify"/>
    <bpmn:sequenceFlow id="FIA3" sourceRef="UT_IA_Verify" targetRef="GW_IA_Match"/>
    <bpmn:sequenceFlow id="FIA4" name="Match OK" sourceRef="GW_IA_Match" targetRef="UT_IA_Approve"/>
    <bpmn:sequenceFlow id="FIA5" name="Mismatch" sourceRef="GW_IA_Match" targetRef="UT_IA_Dispute"/>
    <bpmn:sequenceFlow id="FIA6" sourceRef="UT_IA_Approve" targetRef="ST_IA_GL"/>
    <bpmn:sequenceFlow id="FIA7" sourceRef="UT_IA_Dispute" targetRef="EE_IA_Disp"/>
    <bpmn:sequenceFlow id="FIA8" sourceRef="ST_IA_GL" targetRef="EE_IA_OK"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_IA">
    <bpmndi:BPMNPlane id="BPMNPlane_IA" bpmnElement="Process_InvoiceApproval">
      <bpmndi:BPMNShape id="SE_IA_di" bpmnElement="SE_IA"><dc:Bounds x="152" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_IA_OCR_di" bpmnElement="ST_IA_OCR"><dc:Bounds x="240" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_IA_Verify_di" bpmnElement="UT_IA_Verify"><dc:Bounds x="400" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="GW_IA_Match_di" bpmnElement="GW_IA_Match" isMarkerVisible="true"><dc:Bounds x="555" y="185" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_IA_Approve_di" bpmnElement="UT_IA_Approve"><dc:Bounds x="660" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_IA_Dispute_di" bpmnElement="UT_IA_Dispute"><dc:Bounds x="660" y="310" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_IA_GL_di" bpmnElement="ST_IA_GL"><dc:Bounds x="820" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE_IA_OK_di" bpmnElement="EE_IA_OK"><dc:Bounds x="982" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE_IA_Disp_di" bpmnElement="EE_IA_Disp"><dc:Bounds x="822" y="332" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="FIA1_di" bpmnElement="FIA1"><di:waypoint x="188" y="210"/><di:waypoint x="240" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FIA2_di" bpmnElement="FIA2"><di:waypoint x="340" y="210"/><di:waypoint x="400" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FIA3_di" bpmnElement="FIA3"><di:waypoint x="500" y="210"/><di:waypoint x="555" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FIA4_di" bpmnElement="FIA4"><di:waypoint x="605" y="210"/><di:waypoint x="660" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FIA5_di" bpmnElement="FIA5"><di:waypoint x="580" y="235"/><di:waypoint x="580" y="350"/><di:waypoint x="660" y="350"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FIA6_di" bpmnElement="FIA6"><di:waypoint x="760" y="210"/><di:waypoint x="820" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FIA7_di" bpmnElement="FIA7"><di:waypoint x="760" y="350"/><di:waypoint x="822" y="350"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FIA8_di" bpmnElement="FIA8"><di:waypoint x="920" y="210"/><di:waypoint x="982" y="210"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,

  payment_run: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_PR" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_PaymentRun" name="Payment Run" isExecutable="true">
    <bpmn:startEvent id="SE_PR" name="Payment Run Initiated"><bpmn:outgoing>FPR1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:serviceTask id="ST_PR_Select" name="Select Due Invoices"><bpmn:incoming>FPR1</bpmn:incoming><bpmn:outgoing>FPR2</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="UT_PR_Review" name="Treasury: Review &amp; Approve Run"><bpmn:incoming>FPR2</bpmn:incoming><bpmn:outgoing>FPR3</bpmn:outgoing></bpmn:userTask>
    <bpmn:serviceTask id="ST_PR_BankFile" name="Generate SWIFT / EFT File"><bpmn:incoming>FPR3</bpmn:incoming><bpmn:outgoing>FPR4</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="UT_PR_Upload" name="Treasury: Upload to Bank Portal"><bpmn:incoming>FPR4</bpmn:incoming><bpmn:outgoing>FPR5</bpmn:outgoing></bpmn:userTask>
    <bpmn:serviceTask id="ST_PR_GL" name="Post Payment GL Entries"><bpmn:incoming>FPR5</bpmn:incoming><bpmn:outgoing>FPR6</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:endEvent id="EE_PR" name="Payments Processed"><bpmn:incoming>FPR6</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="FPR1" sourceRef="SE_PR" targetRef="ST_PR_Select"/>
    <bpmn:sequenceFlow id="FPR2" sourceRef="ST_PR_Select" targetRef="UT_PR_Review"/>
    <bpmn:sequenceFlow id="FPR3" sourceRef="UT_PR_Review" targetRef="ST_PR_BankFile"/>
    <bpmn:sequenceFlow id="FPR4" sourceRef="ST_PR_BankFile" targetRef="UT_PR_Upload"/>
    <bpmn:sequenceFlow id="FPR5" sourceRef="UT_PR_Upload" targetRef="ST_PR_GL"/>
    <bpmn:sequenceFlow id="FPR6" sourceRef="ST_PR_GL" targetRef="EE_PR"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_PR">
    <bpmndi:BPMNPlane id="BPMNPlane_PR" bpmnElement="Process_PaymentRun">
      <bpmndi:BPMNShape id="SE_PR_di" bpmnElement="SE_PR"><dc:Bounds x="152" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_PR_Select_di" bpmnElement="ST_PR_Select"><dc:Bounds x="240" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_PR_Review_di" bpmnElement="UT_PR_Review"><dc:Bounds x="400" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_PR_BankFile_di" bpmnElement="ST_PR_BankFile"><dc:Bounds x="560" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_PR_Upload_di" bpmnElement="UT_PR_Upload"><dc:Bounds x="720" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_PR_GL_di" bpmnElement="ST_PR_GL"><dc:Bounds x="880" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE_PR_di" bpmnElement="EE_PR"><dc:Bounds x="1042" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="FPR1_di" bpmnElement="FPR1"><di:waypoint x="188" y="210"/><di:waypoint x="240" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FPR2_di" bpmnElement="FPR2"><di:waypoint x="340" y="210"/><di:waypoint x="400" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FPR3_di" bpmnElement="FPR3"><di:waypoint x="500" y="210"/><di:waypoint x="560" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FPR4_di" bpmnElement="FPR4"><di:waypoint x="660" y="210"/><di:waypoint x="720" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FPR5_di" bpmnElement="FPR5"><di:waypoint x="820" y="210"/><di:waypoint x="880" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FPR6_di" bpmnElement="FPR6"><di:waypoint x="980" y="210"/><di:waypoint x="1042" y="210"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,

  lease_renewal: `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_LR" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_LeaseRenewal" name="Lease Renewal" isExecutable="true">
    <bpmn:startEvent id="SE_LR" name="Renewal Alert Triggered"><bpmn:outgoing>FLR1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:serviceTask id="ST_LR_AI" name="AI: Renewal Recommendation"><bpmn:incoming>FLR1</bpmn:incoming><bpmn:outgoing>FLR2</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:userTask id="UT_LR_Negotiate" name="Property: Negotiate Terms"><bpmn:incoming>FLR2</bpmn:incoming><bpmn:outgoing>FLR3</bpmn:outgoing></bpmn:userTask>
    <bpmn:userTask id="UT_LR_Approve" name="Finance: Approve Renewal"><bpmn:incoming>FLR3</bpmn:incoming><bpmn:outgoing>FLR4</bpmn:outgoing></bpmn:userTask>
    <bpmn:serviceTask id="ST_LR_IFRS" name="Recompute IFRS 16 Schedule"><bpmn:incoming>FLR4</bpmn:incoming><bpmn:outgoing>FLR5</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:serviceTask id="ST_LR_GL" name="Post Remeasurement GL"><bpmn:incoming>FLR5</bpmn:incoming><bpmn:outgoing>FLR6</bpmn:outgoing></bpmn:serviceTask>
    <bpmn:endEvent id="EE_LR" name="Lease Renewed"><bpmn:incoming>FLR6</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="FLR1" sourceRef="SE_LR" targetRef="ST_LR_AI"/>
    <bpmn:sequenceFlow id="FLR2" sourceRef="ST_LR_AI" targetRef="UT_LR_Negotiate"/>
    <bpmn:sequenceFlow id="FLR3" sourceRef="UT_LR_Negotiate" targetRef="UT_LR_Approve"/>
    <bpmn:sequenceFlow id="FLR4" sourceRef="UT_LR_Approve" targetRef="ST_LR_IFRS"/>
    <bpmn:sequenceFlow id="FLR5" sourceRef="ST_LR_IFRS" targetRef="ST_LR_GL"/>
    <bpmn:sequenceFlow id="FLR6" sourceRef="ST_LR_GL" targetRef="EE_LR"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_LR">
    <bpmndi:BPMNPlane id="BPMNPlane_LR" bpmnElement="Process_LeaseRenewal">
      <bpmndi:BPMNShape id="SE_LR_di" bpmnElement="SE_LR"><dc:Bounds x="152" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_LR_AI_di" bpmnElement="ST_LR_AI"><dc:Bounds x="240" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_LR_Negotiate_di" bpmnElement="UT_LR_Negotiate"><dc:Bounds x="400" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UT_LR_Approve_di" bpmnElement="UT_LR_Approve"><dc:Bounds x="560" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_LR_IFRS_di" bpmnElement="ST_LR_IFRS"><dc:Bounds x="720" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ST_LR_GL_di" bpmnElement="ST_LR_GL"><dc:Bounds x="880" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE_LR_di" bpmnElement="EE_LR"><dc:Bounds x="1042" y="192" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="FLR1_di" bpmnElement="FLR1"><di:waypoint x="188" y="210"/><di:waypoint x="240" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLR2_di" bpmnElement="FLR2"><di:waypoint x="340" y="210"/><di:waypoint x="400" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLR3_di" bpmnElement="FLR3"><di:waypoint x="500" y="210"/><di:waypoint x="560" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLR4_di" bpmnElement="FLR4"><di:waypoint x="660" y="210"/><di:waypoint x="720" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLR5_di" bpmnElement="FLR5"><di:waypoint x="820" y="210"/><di:waypoint x="880" y="210"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="FLR6_di" bpmnElement="FLR6"><di:waypoint x="980" y="210"/><di:waypoint x="1042" y="210"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`,
};

/* ─── Properties panel component ─── */
interface ElementInfo {
  id: string;
  name: string;
  elementType: string;
  assignee?: string;
  candidateGroups?: string;
  dueDate?: string;
  conditionExpression?: string;
}

function PropertiesPanel({ element }: { element: ElementInfo | null }) {
  if (!element) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4 text-center">
        <Settings2 className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">Select an element on the canvas to view and edit its properties here.</p>
      </div>
    );
  }

  const type = element.elementType || "Unknown";
  const typeColors: Record<string, string> = {
    StartEvent: "bg-green-600", EndEvent: "bg-red-600",
    UserTask: "bg-blue-600", ServiceTask: "bg-purple-600",
    ScriptTask: "bg-orange-600", SendTask: "bg-cyan-600",
    ReceiveTask: "bg-teal-600", ManualTask: "bg-yellow-600",
    BusinessRuleTask: "bg-pink-600", ExclusiveGateway: "bg-amber-600",
    ParallelGateway: "bg-lime-600", InclusiveGateway: "bg-indigo-600",
    EventBasedGateway: "bg-violet-600", ComplexGateway: "bg-slate-600",
    SubProcess: "bg-slate-600", CallActivity: "bg-rose-600",
    SequenceFlow: "bg-gray-500", Lane: "bg-sky-600",
    Participant: "bg-emerald-600", DataObjectReference: "bg-stone-600",
    TextAnnotation: "bg-zinc-600", IntermediateCatchEvent: "bg-blue-500",
    IntermediateThrowEvent: "bg-orange-500", BoundaryEvent: "bg-red-500",
  };
  const color = typeColors[type] || "bg-gray-600";

  return (
    <div className="p-3 space-y-3 text-sm overflow-y-auto h-full">
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded text-white text-xs font-medium ${color}`}>{type}</span>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">ID</label>
          <div className="mt-1 px-2 py-1.5 bg-muted rounded text-xs font-mono break-all">{element.id}</div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Name</label>
          <div className="mt-1 px-2 py-1.5 bg-muted rounded text-xs min-h-[28px]">{element.name || <span className="text-muted-foreground italic">—</span>}</div>
        </div>
      </div>
      {["UserTask","ServiceTask","ScriptTask","SendTask","ReceiveTask","ManualTask","BusinessRuleTask"].includes(type) && (
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task Properties</p>
          {element.assignee && <div><label className="text-xs text-muted-foreground">Assignee</label><div className="mt-0.5 px-2 py-1 bg-muted rounded text-xs">{element.assignee}</div></div>}
          {element.candidateGroups && <div><label className="text-xs text-muted-foreground">Candidate Groups</label><div className="mt-0.5 px-2 py-1 bg-muted rounded text-xs">{element.candidateGroups}</div></div>}
          {element.dueDate && <div><label className="text-xs text-muted-foreground">Due Date</label><div className="mt-0.5 px-2 py-1 bg-muted rounded text-xs">{element.dueDate}</div></div>}
        </div>
      )}
      {type.includes("Gateway") && (
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gateway Type</p>
          <div className="px-2 py-1 bg-muted rounded text-xs">
            {type === "ExclusiveGateway" && "XOR — only one outgoing path taken"}
            {type === "ParallelGateway" && "AND — all outgoing paths taken simultaneously"}
            {type === "InclusiveGateway" && "OR — one or more outgoing paths taken"}
            {type === "EventBasedGateway" && "Event-based — waits for first matching event"}
            {type === "ComplexGateway" && "Complex — custom activation condition"}
          </div>
        </div>
      )}
      {type === "SequenceFlow" && element.conditionExpression && (
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Condition</p>
          <div className="px-2 py-1 bg-muted rounded text-xs font-mono">{element.conditionExpression || "—"}</div>
        </div>
      )}
      <div className="border-t border-border pt-3">
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Double-click the element on the canvas to edit its label inline.</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─── */
export default function WorkflowModeler() {
  const utils = trpc.useUtils();
  const actionMut = trpc.system.notifyOwner.useMutation({
    onSuccess: () => toast.success("Action completed successfully"),
    onError: (e: any) => toast.error(e.message),
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selectedProcess, setSelectedProcess] = useState("lease_approval");
  const [aiRecord, setAiRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
  const [propsPanelOpen, setPropsPanelOpen] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [isDirty, setIsDirty] = useState(false);
  // Pending XML to send once iframe is ready
  const pendingXmlRef = useRef<string | null>(TEMPLATES.lease_approval);
  const iframeReadyRef = useRef(false);
  // For saveXML request/response
  const saveResolversRef = useRef<Map<string, (xml: string) => void>>(new Map());

  /* ── postMessage from iframe → React ── */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "iframeReady":
          iframeReadyRef.current = true;
          // Send the initial XML
          if (pendingXmlRef.current) {
            iframeRef.current?.contentWindow?.postMessage(
              { cmd: "init", xml: pendingXmlRef.current }, "*"
            );
            pendingXmlRef.current = null;
          }
          break;
        case "ready":
          setLoading(false);
          setIsDirty(false);
          break;
        case "loaded":
          setLoading(false);
          setIsDirty(false);
          break;
        case "selection":
          setSelectedElement(msg.element || null);
          break;
        case "dirty":
          setIsDirty(true);
          break;
        case "zoom":
          setZoom(msg.value ?? 100);
          break;
        case "savedXML":
          if (msg.requestId && saveResolversRef.current.has(msg.requestId)) {
            saveResolversRef.current.get(msg.requestId)!(msg.xml);
            saveResolversRef.current.delete(msg.requestId);
          }
          break;
        case "error":
          console.error("BPMN iframe error:", msg.message);
          setLoading(false);
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  /* ── Send command to iframe ── */
  const sendCmd = useCallback((cmd: object) => {
    iframeRef.current?.contentWindow?.postMessage(cmd, "*");
  }, []);

  /* ── Request saveXML from iframe ── */
  const requestSaveXML = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      saveResolversRef.current.set(requestId, resolve);
      sendCmd({ cmd: "saveXML", requestId });
    });
  }, [sendCmd]);

  /* ── Process change ── */
  const handleProcessChange = (id: string) => {
    setSelectedProcess(id);
    const xml = TEMPLATES[id] || TEMPLATES.blank;
    setLoading(true);
    setSelectedElement(null);
    sendCmd({ cmd: "loadXML", xml });
  };

  /* ── Save ── */
  const handleSave = async () => {
    try {
      const xml = await requestSaveXML();
      console.log("[BPMN XML]", xml);
      setIsDirty(false);
      toast.success("Process definition saved");
    } catch { toast.error("Failed to save process"); }
  };

  /* ── Export ── */
  const handleExport = async () => {
    try {
      const xml = await requestSaveXML();
      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${selectedProcess}.bpmn`; a.click();
      URL.revokeObjectURL(url);
      toast.success("BPMN file exported");
    } catch { toast.error("Failed to export"); }
  };

  /* ── Import ── */
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".bpmn,.xml";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      setLoading(true);
      setSelectedElement(null);
      sendCmd({ cmd: "loadXML", xml: text });
      toast.success(`Imported: ${file.name}`);
    };
    input.click();
  };

  /* ── Zoom controls ── */
  const handleZoomOut  = () => sendCmd({ cmd: "zoom", value: zoom / 100 * 0.8 });
  const handleZoomIn   = () => sendCmd({ cmd: "zoom", value: zoom / 100 * 1.2 });
  const handleFitView  = () => sendCmd({ cmd: "zoom", value: "fit" });
  const handleResetZoom = () => sendCmd({ cmd: "zoom", value: "reset" });

  /* ── Undo / Redo ── */
  const handleUndo = () => sendCmd({ cmd: "undo" });
  const handleRedo = () => sendCmd({ cmd: "redo" });

  return (
    <DashboardLayout>
      <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>

        {/* ── Top toolbar ── */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-[#e60000]" />
            <div>
              <h1 className="text-base font-bold leading-tight">Process Modeler</h1>
              <p className="text-[10px] text-muted-foreground">VFLWFLMOD0001P001 · BPMN 2.0</p>
            </div>
            {isDirty && <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500 ml-2">Unsaved</Badge>}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Select value={selectedProcess} onValueChange={handleProcessChange}>
              <SelectTrigger className="w-52 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{PROCESS_TEMPLATES.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleUndo} title="Undo (Ctrl+Z)"><RotateCcw className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleRedo} title="Redo"><RotateCcw className="w-3.5 h-3.5 scale-x-[-1]" /></Button>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleZoomOut} title="Zoom Out"><ZoomOut className="w-3.5 h-3.5" /></Button>
            <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">{zoom}%</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleZoomIn} title="Zoom In"><ZoomIn className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleFitView} title="Fit to View"><Maximize2 className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleResetZoom} title="Reset Zoom"><AlignCenter className="w-3.5 h-3.5" /></Button>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleImport}><Upload className="w-3.5 h-3.5 mr-1" />Import</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport}><Download className="w-3.5 h-3.5 mr-1" />Export</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toast.info("Simulation engine coming soon")}><Play className="w-3.5 h-3.5 mr-1" />Simulate</Button>
            <Button className="bg-[#e60000] hover:bg-[#cc0000] text-white h-8 text-xs" size="sm" onClick={handleSave}><Save className="w-3.5 h-3.5 mr-1" />Save</Button>
          </div>
        </div>

        {/* ── Canvas + Properties panel ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* BPMN Canvas via iframe */}
          <div className="flex-1 relative overflow-hidden">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#f0f0f0]">
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 border-2 border-[#e60000] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-gray-600">Loading BPMN Modeler…</p>
                  <p className="text-xs text-gray-400">Initialising bpmn-js canvas</p>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src="/api/bpmn-modeler"
              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
              title="BPMN Process Modeler"
            />
          </div>

          {/* Toggle button */}
          <button
            onClick={() => setPropsPanelOpen(o => !o)}
            className="w-5 bg-muted border-l border-border flex items-center justify-center hover:bg-accent transition-colors shrink-0"
            title={propsPanelOpen ? "Hide Properties" : "Show Properties"}
          >
            {propsPanelOpen
              ? <ChevronRight className="w-3 h-3 text-muted-foreground" />
              : <ChevronLeft className="w-3 h-3 text-muted-foreground" />
            }
          </button>

          {/* Properties panel */}
          {propsPanelOpen && (
            <div className="w-64 border-l border-border bg-card flex flex-col shrink-0 overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 shrink-0">
                <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Properties</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <PropertiesPanel element={selectedElement} />
              </div>

              {/* Palette guide */}
              <div className="border-t border-border p-3 shrink-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                  <Layers className="w-3 h-3" />Palette Guide
                </p>
                <div className="space-y-0.5 text-[10px]">
                  {[
                    ["Start / End Events", "Circle"],
                    ["User Task", "Rectangle + person"],
                    ["Service Task", "Rectangle + gear"],
                    ["Script / Send / Receive", "Rectangle + icon"],
                    ["Business Rule Task", "Rectangle + table"],
                    ["Exclusive Gateway (XOR)", "Diamond + X"],
                    ["Parallel Gateway (AND)", "Diamond + +"],
                    ["Inclusive Gateway (OR)", "Diamond + O"],
                    ["Event-Based Gateway", "Diamond + pentagon"],
                    ["Intermediate Events", "Double-ring circle"],
                    ["Sub-Process", "Rounded rect + [+]"],
                    ["Call Activity", "Thick-border rect"],
                    ["Pool / Lane", "Horizontal band"],
                    ["Data Object", "Page icon"],
                    ["Annotation", "Open bracket [ ]"],
                  ].map(([label, hint]) => (
                    <div key={label} className="flex justify-between gap-1">
                      <span className="font-medium text-foreground/80 truncate">{label}</span>
                      <span className="text-right opacity-50 shrink-0 ml-1">{hint}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
                  <FileText className="w-3 h-3 inline mr-1" />
                  Drag from the left palette. Click to select. Double-click to rename.
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  <Grid3X3 className="w-3 h-3 inline mr-1" />
                  Right-click any element for context menu (change type, delete, etc.)
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
