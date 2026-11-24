import type { L10n } from "../i18n";

// 车型目录与命名适配：不同来源的 GLB 命名规范差异很大，
// 每个车型通过 groupName / partName 把场景图节点翻译成中英双语分组与零件名。

// 在本地静态目录内，以查看器页面为基准解析模型路径。
const MODEL_BASE = import.meta.env.BASE_URL + "models/";

export interface ModelDef {
  id: string;
  name: L10n;
  /** 侧栏切换按钮用的短名 */
  short: L10n;
  file: string;
  /** 模型根节点在场景图路径中的段名（此段之后才是语义层级） */
  rootSegment: string;
  credit: L10n;
  license: L10n;
  link: string;
  /** 从根节点之后的路径段推导分组名 */
  groupName(rel: string[], material: string): L10n;
  /** 从路径段 + 材质推导零件名 */
  partName(rel: string[], material: string): L10n;
}

// —— 通用清理工具 ——

function clean(s: string): string {
  return s
    .replace(/^ar8:?/, "")
    .replace(/_ar8:?.*$/, "")
    .replace(/^pasted__/, "")
    .replace(/(_\d+)+$/, "")
    .replace(/\d+$/, "")
    .trim();
}

function isGarbage(s: string): boolean {
  return /^(mesh|polySurface|group|pasted|object|plane|logo)[\s_0-9.]*$/i.test(s);
}

/** GLB 原始名称（本身多为英文）在两种语言下原样展示 */
function raw(s: string): L10n {
  return { zh: s, en: s };
}

// —— BMW E30 M3 ——

const BMW_GROUP: Record<string, L10n> = {
  BODY: { zh: "车身总成", en: "Body" },
  RIM: { zh: "轮辋", en: "Rim" },
  TIRE: { zh: "轮胎", en: "Tire" },
  Brake_disc: { zh: "制动盘", en: "Brake disc" },
  Brembo_Calipers: { zh: "制动卡钳", en: "Brake caliper" },
  Logo_Plane: { zh: "卡钳标识", en: "Caliper logo" },
};

const BMW_MAT: Record<string, L10n> = {
  PAINT: { zh: "车漆覆盖件", en: "Painted panel" },
  PLASTIC: { zh: "黑色塑料件", en: "Black plastic" },
  CHROME: { zh: "镀铬件", en: "Chrome" },
  WINDOWS: { zh: "车窗玻璃", en: "Window glass" },
  BLACKOUT: { zh: "黑色装饰件", en: "Blackout trim" },
  SIDE_MIRROR: { zh: "外后视镜", en: "Side mirror" },
  TAILLIGHT_REFLECTOR: { zh: "尾灯反光板", en: "Taillight reflector" },
  HEADLIGHT_REFLECTOR: { zh: "前灯反光碗", en: "Headlight reflector" },
  EMBLEMS: { zh: "车标徽章", en: "Emblem" },
  LENS: { zh: "灯罩玻璃", en: "Lens glass" },
  RIM: { zh: "轮辋", en: "Rim" },
  TIRE: { zh: "轮胎", en: "Tire" },
  Brake_Disc: { zh: "制动盘", en: "Brake disc" },
  Brembo_Calipers: { zh: "制动卡钳", en: "Brake caliper" },
  Logo_Plane: { zh: "卡钳标识", en: "Caliper logo" },
};

const bmw: ModelDef = {
  id: "bmw-m3-e30",
  name: raw("BMW M3 (E30) 1986–1991"),
  short: raw("BMW M3"),
  file: MODEL_BASE + "free_bmw_m3_e30.glb",
  rootSegment: "GLTF_SceneRootNode",
  credit: raw("Martin Trafas (TinoD2)"),
  license: raw("CC BY 4.0"),
  link: "https://sketchfab.com/3d-models/free-bmw-m3-e30-ac3c7013434e403e8faff87948caf422",
  groupName(rel) {
    const key = clean(rel[0] ?? "").replace(/^BMW_E30_M3_/, "");
    return BMW_GROUP[key] ?? raw(key);
  },
  partName(_rel, material) {
    const key = material.replace(/^BMW_E30_M3_/, "");
    return BMW_MAT[key] ?? raw(key);
  },
};

// —— Tesla Model 3 ——

const TESLA_GROUP: Record<string, L10n> = {
  chassis: { zh: "车身与底盘", en: "Body & chassis" },
  door_lf: { zh: "左前车门", en: "Front-left door" },
  door_rf: { zh: "右前车门", en: "Front-right door" },
  door_lr: { zh: "左后车门", en: "Rear-left door" },
  door_rr: { zh: "右后车门", en: "Rear-right door" },
  bump_front: { zh: "前保险杠", en: "Front bumper" },
  bump_rear: { zh: "后保险杠", en: "Rear bumper" },
  boot: { zh: "后备箱", en: "Trunk" },
  steering: { zh: "转向系统", en: "Steering" },
  dvornik: { zh: "雨刮系统", en: "Wipers" },
  wheel_rf: { zh: "右前车轮", en: "Front-right wheel" },
  wheel_lf: { zh: "左前车轮", en: "Front-left wheel" },
  wheel_rb: { zh: "右后车轮", en: "Rear-right wheel" },
  wheel_lb: { zh: "左后车轮", en: "Rear-left wheel" },
  hub_rf: { zh: "右前轮毂", en: "Front-right hub" },
  hub_lf: { zh: "左前轮毂", en: "Front-left hub" },
  hub_rb: { zh: "右后轮毂", en: "Rear-right hub" },
  hub_lb: { zh: "左后轮毂", en: "Rear-left hub" },
};

const TESLA_MAT: Record<string, L10n> = {
  primary: { zh: "车漆件", en: "Paint" },
  chassis: { zh: "车身结构件", en: "Body structure" },
  putih: { zh: "白色内饰件", en: "White interior" },
  whiteleather: { zh: "白色皮革", en: "White leather" },
  "seat leather white": { zh: "白色真皮座椅", en: "White leather seat" },
  plastic: { zh: "塑料件", en: "Plastic" },
  "just black": { zh: "黑色塑料件", en: "Black plastic" },
  "black lights": { zh: "灯组黑色饰件", en: "Black light trim" },
  glass: { zh: "玻璃", en: "Glass" },
  carpet: { zh: "地毯", en: "Carpet" },
  "carpet light": { zh: "地垫灯", en: "Carpet light" },
  lcds: { zh: "中控屏", en: "Center display" },
  "texture buttons": { zh: "按键面板", en: "Button panel" },
  "texture leather": { zh: "皮革饰件", en: "Leather trim" },
  movsteer: { zh: "方向盘组件", en: "Steering wheel" },
  dvorright: { zh: "雨刮", en: "Wiper" },
  suspensi: { zh: "悬架", en: "Suspension" },
  wheels: { zh: "轮胎总成", en: "Wheel assembly" },
  hub: { zh: "轮毂", en: "Hub" },
  "tembus red": { zh: "红色透光件", en: "Red translucent part" },
  platnomor: { zh: "车牌", en: "License plate" },
  belt: { zh: "安全带", en: "Seat belt" },
  "satin red": { zh: "红色饰件", en: "Red trim" },
  hitam: { zh: "黑色件", en: "Black part" },
  aluminium: { zh: "铝饰件", en: "Aluminum trim" },
  chrome: { zh: "镀铬件", en: "Chrome" },
  cahrome: { zh: "镀铬件", en: "Chrome" },
  "mirror inside": { zh: "车内后视镜", en: "Interior mirror" },
  "back chrome light": { zh: "尾部镀铬灯饰", en: "Rear chrome light" },
  pantulans: { zh: "反光片", en: "Reflector" },
  frunkplastic: { zh: "前备箱塑料件", en: "Frunk plastic" },
  "front black": { zh: "前部黑色件", en: "Front black part" },
  "paint black": { zh: "黑色漆面", en: "Black paint" },
  black: { zh: "黑色件", en: "Black part" },
  bodysills: { zh: "侧裙", en: "Side sill" },
  "light night": { zh: "氛围灯", en: "Ambient light" },
};

function teslaMaterial(material: string): L10n | null {
  const base = material.toLowerCase().split(".")[0].replace(/[\s_]+/g, " ").trim();
  if (TESLA_MAT[base]) return TESLA_MAT[base];
  // 前缀匹配：hub_rb -> hub、chrome1 -> chrome、movsteer_1 -> movsteer
  const keys = Object.keys(TESLA_MAT).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (base.startsWith(k)) return TESLA_MAT[k];
  }
  return null;
}

const tesla: ModelDef = {
  id: "tesla-model-3",
  name: raw("Tesla Model 3 2018"),
  short: raw("Model 3"),
  file: MODEL_BASE + "tesla_2018_model_3.glb",
  rootSegment: "Tesla Model 3",
  credit: raw("Ameer Studio (uchiha.321abc)"),
  license: raw("CC BY 4.0"),
  link: "https://sketchfab.com/3d-models/tesla-2018-model-3-5ef9b845aaf44203b6d04e2c677e444f",
  groupName(rel) {
    // 找最深的 *_dummy 组件节点（车门/车轮/保险杠等）
    for (let i = rel.length - 2; i >= 0; i--) {
      const seg = rel[i];
      if (seg.endsWith("_dummy")) {
        const key = clean(seg).replace(/_dummy$/, "");
        return TESLA_GROUP[key] ?? raw(key);
      }
    }
    const parent = clean(rel[rel.length - 2] ?? rel[0] ?? "");
    return TESLA_GROUP[parent] ?? raw(parent);
  },
  partName(rel, material) {
    const groupRaw = (() => {
      for (let i = rel.length - 2; i >= 0; i--) {
        if (rel[i].endsWith("_dummy")) return clean(rel[i]);
      }
      return clean(rel[rel.length - 2] ?? "");
    })();
    const leaf = clean(rel[rel.length - 1] ?? "").replace(groupRaw, "").replace(/^[_\-.]+/, "");
    const mat = teslaMaterial(material);
    if (mat) return mat;
    return leaf && !isGarbage(leaf) ? raw(leaf) : raw(material.split(".")[0]);
  },
};

export const MODELS: ModelDef[] = [bmw, tesla];
export const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));
