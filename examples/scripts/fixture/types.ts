// Fixture types — shared between the fixture modules and the bootstrap script.
//
// Everything here is expressed in terms of tempIds (opaque local strings the
// bootstrap resolves to real Contentful sys.ids after each resource is created).
// This keeps the fixture self-referential without baking any target-space ids in.

export type TempId = string;

// --- Content model ------------------------------------------------------------

export type ContentTypeFixture = {
  id: string;
  name: string;
  description?: string;
  displayField?: string;
  fields: ContentTypeField[];
};

export type ContentTypeField =
  | { id: string; name: string; type: 'Symbol' | 'Text' | 'Date' | 'RichText' | 'Object' | 'Boolean' | 'Integer' | 'Number'; required?: boolean; localized?: boolean }
  | { id: string; name: string; type: 'Link'; linkType: 'Asset' | 'Entry'; required?: boolean; localized?: boolean; validations?: unknown[] }
  | { id: string; name: string; type: 'Array'; items: { type: 'Link'; linkType: 'Asset' | 'Entry'; validations?: unknown[] } | { type: 'Symbol'; validations?: unknown[] }; required?: boolean; localized?: boolean };

// --- Assets -------------------------------------------------------------------

export type AssetFixture = {
  tempId: TempId;
  title: string;
  fileName: string;
  contentType: string;
  sourceUrl: string;
};

// --- Entries ------------------------------------------------------------------

export type EntryFixture = {
  tempId: TempId;
  contentTypeId: string;
  fields: Record<string, unknown>;
};

// Placeholder value the bootstrap swaps for a real Link->Asset payload.
export type AssetRef = { $assetTempId: TempId };
export const assetRef = (tempId: TempId): AssetRef => ({ $assetTempId: tempId });

// --- ComponentTypes -----------------------------------------------------------

export type ComponentTypeFixture = {
  id: string;
  name: string;
  description?: string;
  contentProperties?: ContentPropertyDef[];
  designProperties?: DesignPropertyDef[];
  slots?: SlotDef[];
};

export type ContentPropertyDef =
  | { id: string; name: string; type: 'String' | 'RichText' | 'Boolean' | 'Number'; required?: boolean };

export type DesignPropertyDef = {
  id: string;
  name: string;
  description?: string;
  type: 'String' | 'DTCG.Color' | 'DTCG.Dimension' | 'DTCG.FontWeight' | 'Boolean' | 'Number';
  validations?: unknown[];
  allowedResources?: Array<{ type: 'DesignToken'; value: string }>;
};

export type SlotDef = { id: string; name: string; description?: string };

// --- Templates ----------------------------------------------------------------

export type TemplateFixture = {
  id: string;
  name: string;
  description?: string;
  contentProperties?: ContentPropertyDef[];
  designProperties?: DesignPropertyDef[];
  // Slot declarations — Experiences using this template put their top-level
  // nodes into a slot with a matching id. `slots: [{ id: 'content' }]` on the
  // template + a `componentTree` node with `{ nodeType: 'Slot', slotId: 'content' }`
  // is the mechanism that says "render the Experience's `content` slot here."
  slots?: SlotDef[];
  componentTree?: TemplateTreeNode[];
};

export type TemplateTreeNode = {
  id: string;
  nodeType: 'Slot';
  slotId: string;
};

// --- DataAssemblies -----------------------------------------------------------
//
// A DataAssembly declares:
//   1. parameters — inputs (entries or values) the assembly is invoked with.
//   2. resolvers — how to fetch data from those parameters (GraphQL against
//      the space's content graph, or nested DataAssembly).
//   3. return — how to map resolver output onto the target ComponentType's
//      contentProperties by id.
//
// For the minimal demo we only use the GraphQL resolver flavor and one
// parameter per assembly.

export type DataAssemblyFixture = {
  tempId: TempId;
  name: string;
  description?: string;
  // dataType MUST mirror the ComponentType's contentProperties this assembly targets.
  dataType: ContentPropertyDef[];
  parameters: Record<
    string,
    {
      name: string;
      linkType: 'Contentful:Entry';
      allowedContentTypes: string[];
    }
  >;
  resolvers: Record<
    string,
    {
      source: 'Contentful:GraphQL';
      query: string;
      parameters: Record<string, string>; // e.g. { id: '$parameters/promo' }
    }
  >;
  // Map from ComponentType contentProperty id -> resolver output path.
  return: Record<string, { $from: string }>;
};

// --- Experience ---------------------------------------------------------------

export type ExperienceFixture = {
  id: string;
  name: string;
  description?: string;
  templateId: string;
  viewports: Array<{ id: string; query: string; displayName: string; previewSize: string }>;
  slots: { content: ExperienceNode[] };
};

export type ExperienceNode =
  | InlineFragmentNode
  | ContainerNode;

// An InlineFragment node has its content sourced from a DataAssembly binding.
export type InlineFragmentNode = {
  id: string;
  nodeType: 'InlineFragment';
  componentTypeId: string;
  designProperties?: Record<string, ViewportValue>;
  contentBindings: {
    dataAssemblyTempId: TempId;
    parameters: Record<string, { $entryTempId: TempId }>;
  };
  slots?: Record<string, ExperienceNode[]>;
};

// A Container node has inline contentProperties + designProperties and children in slots.
export type ContainerNode = {
  id: string;
  nodeType: 'InlineFragment';
  componentTypeId: string;
  contentProperties?: Record<string, ViewportValue>;
  designProperties?: Record<string, ViewportValue>;
  slots?: Record<string, ExperienceNode[]>;
};

// A design/content property value is keyed by viewport id ('_' = default).
export type ViewportValue = Record<string, DesignValue>;

export type DesignValue =
  | { type: 'ManualDesignValue'; value: string | number | boolean | null }
  | { type: 'DesignToken'; value: string };
