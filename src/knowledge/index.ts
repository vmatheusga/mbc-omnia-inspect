import data from "./knowledge.generated.json";
import { buildKnowledgeIndex } from "../engine/knowledge";
import type { Knowledge } from "../engine/types";

export const knowledge = data as unknown as Knowledge;
export const knowledgeIndex = buildKnowledgeIndex(knowledge);
