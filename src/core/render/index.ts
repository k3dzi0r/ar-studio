// Importing a content module registers it. Add new types here.
import './model3d'
import './media'

export { getContentType, listContentTypes } from './registry'
export type { ContentRuntime, ContentType, Field } from './registry'
