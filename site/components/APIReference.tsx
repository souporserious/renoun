// import { Fragment } from 'react'
// import type { ModuleExportedTypes } from 'mdxts'
// import type { CSSProp } from 'restyle'
// import {
//   MDXComponents,
//   type ExportedTypeOfKind,
// } from 'mdxts/components'
// import { CodeInline, MDXContent } from 'mdxts/components'
// import { ViewSource } from 'components/ViewSource'

// const mdxComponents = {
//   p: (props) => <p {...props} css={{ margin: 0 }} />,
//   code: (props) => <MDXComponents.code {...props} paddingY="0" />,
// } satisfies MDXComponents

// export function APIReference({
//   type,
//   isActive,
// }: {
//   type: ModuleExportedTypes[number]
//   isActive: boolean
// }) {
//   return (
//     <div
//       key={type.name}
//       css={{
//         display: 'flex',
//         flexDirection: 'column',
//         padding: isActive ? '3.2rem 0' : '1.6rem 0',
//         borderBottom: '1px solid var(--color-separator-secondary)',
//       }}
//     >
//       <div
//         css={{
//           display: 'flex',
//           flexDirection: 'column',
//           gap: '0.8rem',
//         }}
//       >
//         <div
//           css={{
//             display: 'flex',
//             alignItems: 'center',
//             gap: '1rem',
//           }}
//         >
//           {isActive ? (
//             <h3
//               id={type.slug}
//               css={{ flexShrink: 0, fontWeight: 500, margin: 0 }}
//             >
//               {type.name}
//             </h3>
//           ) : (
//             <a href={type.pathname}>
//               <h3
//                 id={type.slug}
//                 css={{ flexShrink: 0, fontWeight: 500, margin: 0 }}
//               >
//                 {type.name}
//               </h3>
//             </a>
//           )}

//           <CodeInline value={type.type} language="typescript" />

//           {/* {isActive && type.sourcePath && <ViewSource href={type.sourcePath} />} */}
//         </div>

//         {!type.isMainExport && type.description ? (
//           <MDXContent value={type.description} components={mdxComponents} />
//         ) : null}
//       </div>

//       {isActive ? (
//         <div css={{ display: 'flex' }}>
//           <TypeChildren type={type} css={{ marginTop: '2rem' }} />
//         </div>
//       ) : null}
//     </div>
//   )
// }

// /** Determines how to render the immediate type children based on its kind. */
// function TypeChildren({
//   type,
//   css: cssProp,
// }: {
//   type: ExportedTypeOfKind<
//     'Interface' | 'Enum' | 'Class' | 'Function' | 'Component'
//   >
//   css: CSSProp
// }) {
//   if (
//     type.kind === 'Interface' ||
//     type.kind === 'Component'
//   ) {
//     return <TypeProperties type={type} css={cssProp} />
//   }

//   if (type.kind === 'Enum') {
//     return <CodeInline value={type.type} language="typescript" />
//   }

//   if (type.kind === 'Class') {
//     return (
//       <div
//         css={{
//           display: 'flex',
//           flexDirection: 'column',
//           marginTop: '1.5rem',
//           gap: '1.2rem',
//           ...cssProp,
//         }}
//       >
//         {type.accessors && type.accessors.length > 0 ? (
//           <div css={{ marginTop: '1rem' }}>
//             <h4>Accessors</h4>
//             {type.accessors.map((accessor, index) => (
//               <TypeValue key={index} type={accessor} />
//             ))}
//           </div>
//         ) : null}
//         {/* <h4>Constructors</h4>
//         {type.constructors?.map((constructor, index) => (
//           <TypeValue key={index} type={constructor} />
//         ))} */}
//         {type.methods && type.methods.length > 0 ? (
//           <div css={{ marginTop: '1rem' }}>
//             <h4>Methods</h4>
//             {type.methods.map((method, index) => (
//               <TypeValue key={index} type={method} />
//             ))}
//           </div>
//         ) : null}
//         {type.properties && type.properties.length > 0 ? (
//           <div css={{ marginTop: '1rem' }}>
//             <h4>Properties</h4>
//             {type.properties.map((property, index) => (
//               <TypeValue key={index} type={property} />
//             ))}
//           </div>
//         ) : null}
//       </div>
//     )
//   }

//   if (type.kind === 'Function') {
//     return (
//       <div
//         css={{
//           display: 'flex',
//           flexDirection: 'column',
//           marginTop: '1.5rem',
//           gap: '1.2rem',
//           ...cssProp,
//         }}
//       >
//         {/* <div css={{ display: 'flex' }}>
//           <CodeInline value={type.type} language="typescript" />
//         </div> */}
//         {type.parameters && type.parameters.length > 0 ? (
//           <div css={{ marginTop: '1rem' }}>
//             <h4>Parameters</h4>
//             {type.parameters.map((parameter, index) => (
//               <TypeValue key={index} type={parameter} />
//             ))}
//           </div>
//         ) : null}
//       </div>
//     )
//   }

//   return null
// }

// /** Determines how to render the immediate type properties accounting for unions. */
// function TypeProperties({
//   type,
//   css: cssProp,
// }: {
//   type: ExportedTypeOfKind<'Properties'>
//   css?: CSSProp
// }) {
//   if (type.unionProperties && type.unionProperties.length > 0) {
//     const { unionProperties, ...restType } = type
//     return (
//       <div css={{ marginTop: '1rem', ...cssProp }}>
//         {/* <CodeInline value={type.type} language="typescript" /> */}
//         <h4>Properties</h4>
//         <div
//           css={{
//             display: 'flex',
//             flexDirection: 'column',
//             marginTop: '1.5rem',
//             gap: '1.2rem',
//           }}
//         >
//           <h4
//             css={{
//               fontWeight: 500,
//               color: 'var(--color-foreground-secondary)',
//             }}
//           >
//             {type.type}
//           </h4>
//           {type.description && (
//             <MDXContent value={type.description} components={mdxComponents} />
//           )}
//           <div
//             css={{
//               padding: '0 1.5rem',
//               margin: '0.75rem 0 0 -1.5rem',
//               border: '1px solid var(--color-separator-secondary)',
//               borderRadius: '1rem',
//               position: 'relative',
//             }}
//           >
//             <span
//               className="title"
//               css={{
//                 position: 'absolute',
//                 left: '2rem',
//                 top: 0,
//                 translate: '0 -50%',
//                 padding: '0.25rem 0.5rem',
//                 margin: '0 0 0 -1rem',
//                 borderRadius: '1rem',
//                 backgroundColor: 'var(--color-separator-secondary)',
//               }}
//             >
//               Union
//             </span>
//             {unionProperties.map((properties, index) => (
//               <Fragment key={index}>
//                 {index > 0 ? (
//                   <div
//                     css={{
//                       display: 'grid',
//                       gridTemplateColumns: '1fr auto 1fr',
//                       alignItems: 'center',
//                       margin: '0 -1.5rem',
//                     }}
//                   >
//                     <div
//                       css={{
//                         height: 1,
//                         backgroundColor: 'var(--color-separator-secondary)',
//                       }}
//                     />
//                     <div css={{ height: 1 }}>
//                       <span
//                         css={{
//                           fontSize: 'var(--font-size-body-2)',
//                           padding: '0.1rem 1rem 0.25rem',
//                           border: '1px solid var(--color-separator-secondary)',
//                           borderRadius: '1rem',
//                           color: 'var(--color-foreground-secondary)',
//                           position: 'relative',
//                           top: '-0.95rem',
//                           userSelect: 'none',
//                         }}
//                       >
//                         or
//                       </span>
//                     </div>
//                     <div
//                       css={{
//                         height: 1,
//                         backgroundColor: 'var(--color-separator-secondary)',
//                       }}
//                     />
//                   </div>
//                 ) : null}
//                 {properties.map((propertyType, index) => (
//                   <TypeValue key={index} type={propertyType} />
//                 ))}
//               </Fragment>
//             ))}
//           </div>
//           <TypeProperties type={restType} />
//         </div>
//       </div>
//     )
//   }

//   if (type.properties && type.properties.length > 0) {
//     return (
//       <div
//         css={{
//           display: 'flex',
//           flexDirection: 'column',
//           marginTop: '1.5rem',
//           gap: '1.2rem',
//           ...cssProp,
//         }}
//       >
//         {/* <div css={{ display: 'flex' }}>
//           <CodeInline value={type.type} language="typescript" />
//         </div> */}
//         <h4>Properties</h4>
//         {type.properties.map((propertyType, index) => (
//           <TypeValue key={index} type={propertyType} />
//         ))}
//       </div>
//     )
//   }

//   return null
// }

// /** Renders a type value with its name, type, and description. */
// function TypeValue({
//   type,
//   css: cssProp,
// }: {
//   type: ExportedTypeOfKind<
//     | 'FunctionValue'
//     | 'ObjectValue'
//     | 'LiteralValue'
//     | 'Value'
//     | 'ClassGetAccessor'
//     | 'ClassSetAccessor'
//     | 'ClassMethod'
//     | 'ClassProperty'
//   >
//   css?: CSSProp
// }) {
//   const isNameSameAsType = type.name === type.type
//   const hasRequired =
//     type.kind === 'FunctionValue' ||
//     type.kind === 'ObjectValue' ||
//     type.kind === 'Value'
//   return (
//     <div
//       key={type.name + type.type}
//       css={{
//         display: 'flex',
//         flexDirection: 'column',
//         padding: '1.5rem 0',
//         gap: '0.8rem',
//         ...cssProp,
//       }}
//     >
//       <div
//         css={{
//           display: 'flex',
//           alignItems: 'center',
//           gap: 8,
//         }}
//       >
//         <h4
//           css={{
//             display: 'flex',
//             alignItems: 'flex-start',
//             flexShrink: 0,
//             margin: 0,
//             fontWeight: 400,
//             color: 'var(--color-foreground-secondary)',
//           }}
//         >
//           {type.name}{' '}
//           {hasRequired && type.required && (
//             <span css={{ color: 'oklch(0.8 0.15 36.71)' }} title="required">
//               *
//             </span>
//           )}
//         </h4>
//         <div
//           css={{
//             display: 'flex',
//             alignItems: 'center',
//             gap: '0.25rem',
//           }}
//         >
//           {isNameSameAsType ? null : (
//             <CodeInline
//               value={type.type}
//               language="typescript"
//               paddingX="0.5rem"
//               paddingY="0.2rem"
//               css={{ fontSize: 'var(--font-size-body-2)' }}
//             />
//           )}
//           {/* {!isLiteralValue && type.defaultValue ? (
//             <span
//               css={{
//                 flexShrink: 0,
//                 display: 'flex',
//                 alignItems: 'center',
//                 gap: '0.25rem',
//               }}
//             >
//               ={' '}
//               <CodeInline
//                 value={JSON.stringify(type.defaultValue)}
//                 language="typescript"
//               />
//             </span>
//           ) : null} */}
//         </div>
//       </div>

//       {type.description && (
//         <MDXContent value={type.description} components={mdxComponents} />
//       )}

//       {type.kind === 'ObjectValue' && type.properties
//         ? type.properties.map((propertyType, index) => (
//             <TypeValue
//               key={index}
//               type={propertyType}
//               css={{ paddingLeft: '1.5rem' }}
//             />
//           ))
//         : null}

//       {type.kind === 'FunctionValue' && type.parameters
//         ? type.parameters.map((parameter, index) => (
//             <TypeValue
//               key={index}
//               type={parameter}
//               css={{ paddingLeft: '1.5rem' }}
//             />
//           ))
//         : null}
//     </div>
//   )
// }
