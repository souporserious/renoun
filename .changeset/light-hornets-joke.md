---
'renoun': major
---

Renames the `APIReference` component to `Reference`, this rename is in anticipation of providing support for generating references for multiple sources in the near future. The component and the `JavaScriptFileExport#getType` method have also been fully refactored to support more granular type inference and rendering.

Notably, the `Reference` component now accepts a `components` prop that allows overriding every component within the tree:

```tsx
<Reference
  source="components/Button.tsx"
  components={{
    SectionHeading: (props) => (
      <h3
        {...props}
        css={{
          fontSize: 'var(--font-size-heading-2)',
          lineHeight: 'var(--line-height-heading-2)',
          fontWeight: 'var(--font-weight-heading)',
        }}
      />
    ),
    Detail: (props) => (
      <div
        {...props}
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      />
    ),
    Code: (props) => (
      <code
        {...props}
        css={{
          fontFamily: 'var(--font-family-code)',
        }}
      />
    ),
  }}
/>
```

For complete customization, the `JavaScriptFileExport#getType` method can be used directly.
