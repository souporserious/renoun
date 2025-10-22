// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse } from 'waku/router';

// prettier-ignore
import type { getConfig as File_Root_getConfig } from './pages/_root';
// prettier-ignore
import type { getConfig as File_About_getConfig } from './pages/about';
// prettier-ignore
import type { getConfig as File_BlogSlugIndex_getConfig } from './pages/blog/[slug]/index';
// prettier-ignore
import type { getConfig as File_BlogIndex_getConfig } from './pages/blog/index';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_TagsSlugIndex_getConfig } from './pages/tags/[slug]/index';

// prettier-ignore
type Page =
| ({ path: '/_root' } & GetConfigResponse<typeof File_Root_getConfig>)
| ({ path: '/about' } & GetConfigResponse<typeof File_About_getConfig>)
| ({ path: '/blog/[slug]' } & GetConfigResponse<typeof File_BlogSlugIndex_getConfig>)
| ({ path: '/blog' } & GetConfigResponse<typeof File_BlogIndex_getConfig>)
| ({ path: '/' } & GetConfigResponse<typeof File_Index_getConfig>)
| ({ path: '/tags/[slug]' } & GetConfigResponse<typeof File_TagsSlugIndex_getConfig>);

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
  }
}
