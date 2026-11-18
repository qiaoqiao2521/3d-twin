import * as THREE from 'three';
import { getSharedBeadBlastBumpMap, upgradeGlbPbrAndBuildStaticBvh } from './hybridRayTracing';
import { parseUrdfJoints, type UrdfJointDef } from './manifestUtils';
import {
  disposeSceneHierarchy,
  ensureMeshoptLodReady,
  fetchTextAssetResilient,
  loadGlbSceneResilient
} from './resilientGlbLoader';

interface CombatTemplate {
  template: THREE.Group;
  joints?: Promise<UrdfJointDef[]>;
}

interface TemplateRequest {
  promise: Promise<CombatTemplate>;
  value?: CombatTemplate;
  retryAt?: number;
}

const FAILED_ASSET_RETRY_MS = 2500;

/** Each mounted battlefield owns the decoded geometry shared by its mech and enemy clones. */
export function createMarsCombatAssets(
  loadScene = loadGlbSceneResilient,
  loadText = fetchTextAssetResilient,
  now = () => performance.now()
) {
  const models = new Map<string, Promise<THREE.Group>>();
  const requests = new Map<string, TemplateRequest>();
  const ownedModels = new Set<THREE.Group>();
  const sharedTextures = new Set([getSharedBeadBlastBumpMap()]);
  let disposed = false;

  const disposeModel = (model: THREE.Group) => {
    disposeSceneHierarchy(model, { disposeTextures: true, sharedTextures });
  };

  const loadModel = async (urls: string[], key: string) => {
    await ensureMeshoptLodReady();
    if (disposed) throw new Error('Battlefield unloaded');
    const parts = await Promise.allSettled(urls.map(loadScene));
    const group = new THREE.Group();
    for (const part of parts) {
      if (part.status === 'fulfilled') group.add(part.value);
    }
    try {
      const failed = parts.find((part) => part.status === 'rejected');
      if (failed) throw failed.reason;
      if (disposed) throw new Error('Battlefield unloaded');
      upgradeGlbPbrAndBuildStaticBvh(group, key, () => 'L1');
      ownedModels.add(group);
      return group;
    } catch (error) {
      disposeModel(group);
      throw error;
    }
  };

  const request = (urls: string[], urdfUrl?: string): TemplateRequest => {
    const modelKey = urls.join('|');
    const key = urdfUrl ? `${modelKey}:${urdfUrl}` : modelKey;
    const previous = requests.get(key);
    if (previous && (previous.retryAt === undefined || now() < previous.retryAt)) {
      return previous;
    }

    let model = models.get(modelKey);
    if (!model) {
      model = loadModel(urls, modelKey).catch((error) => {
        models.delete(modelKey);
        throw error;
      });
      models.set(modelKey, model);
    }
    const joints = urdfUrl
      ? loadText(urdfUrl).then(parseUrdfJoints).catch(() => {
          entry.retryAt = now() + FAILED_ASSET_RETRY_MS;
          return [];
        })
      : undefined;
    const entry: TemplateRequest = {
      promise: model.then((template) => {
        if (disposed) throw new Error('Battlefield unloaded');
        return { template, joints };
      })
    };
    requests.set(key, entry);
    entry.promise.then(
      (value) => { entry.value = value; },
      () => { entry.retryAt = now() + FAILED_ASSET_RETRY_MS; }
    );
    return entry;
  };

  const dispose = () => {
    disposed = true;
    ownedModels.forEach(disposeModel);
    ownedModels.clear();
    models.clear();
    requests.clear();
  };
  return { request, dispose };
}
