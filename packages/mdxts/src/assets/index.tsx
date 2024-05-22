import React from 'react'

/**
 * The logo mark of the MDXTS library.
 * @internal
 */
export function MdxtsMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <g clipPath="url(#clip0_3724_386)">
        <path
          d="M12 6.02295L22 24.023L2 24.023L12 6.02295Z"
          fillOpacity="0.8"
        />
        <g filter="url(#filter0_d_3724_386)">
          <path
            d="M12 18.023L2 0.0229492L22 0.0229547L12 18.023Z"
            fillOpacity="0.9"
            shapeRendering="crispEdges"
          />
        </g>
      </g>
      <defs>
        <filter
          id="filter0_d_3724_386"
          x="-2"
          y="-1.97705"
          width="28"
          height="26"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="2" />
          <feGaussianBlur stdDeviation="2" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_3724_386"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_3724_386"
            result="shape"
          />
        </filter>
        <clipPath id="clip0_3724_386">
          <rect width="24" height="24" />
        </clipPath>
      </defs>
    </svg>
  )
}

/**
 * The logo of the MDXTS library.
 * @internal
 */
export function MdxtsMarkLink({
  size,
  className,
  style,
}: {
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <a
      href="https://www.mdxts.dev"
      rel="noopener"
      target="_blank"
      className={className}
      style={{ display: 'flex', ...style }}
    >
      <MdxtsMark size={size} />
    </a>
  )
}

/**
 * The logo of the MDXTS library.
 * @internal
 */
export function MdxtsLogo({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 93 24"
      className={className}
      style={{
        width: 93,
        height: 24,
        fill: 'currentcolor',
        ...style,
      }}
    >
      <g clipPath="url(#clip0_44_57)">
        <path
          d="M47 6.02295L57 24.023L37 24.023L47 6.02295Z"
          fillOpacity="0.8"
        />
        <g filter="url(#filter0_d_44_57)">
          <path
            d="M47 18.023L37 0.0229492L57 0.0229547L47 18.023Z"
            fillOpacity="0.9"
            shapeRendering="crispEdges"
          />
        </g>
        <path d="M4.82808 0.0239289L0 0.0239281L-4.12453e-06 23.6135L3.64536 23.6135L3.64536 15.6099L3.43474 5.46767L6.72367 16.339L8.74888 16.339L12.378 5.07884L12.1512 15.6099L12.1512 23.6135L15.8128 23.6135L15.8128 0.0239309L10.9685 0.02393L7.74438 10.1175L4.82808 0.0239289Z" />
        <path d="M18.9605 23.6135L24.9227 23.6135C26.0028 23.6135 27.0127 23.4839 27.9524 23.2247C28.9029 22.9654 29.767 22.5928 30.5446 22.1067C31.2359 21.6639 31.8624 21.1292 32.4241 20.5028C32.9965 19.8763 33.4826 19.1797 33.8822 18.4128C34.2927 17.6243 34.6059 16.7548 34.8219 15.8043C35.0487 14.843 35.1621 13.8277 35.1621 12.7584L35.1621 10.9114C35.1621 9.79891 35.0433 8.75121 34.8057 7.76831C34.5681 6.78541 34.2333 5.88352 33.8012 5.06264C33.38 4.27416 32.8561 3.56129 32.2297 2.92402C31.614 2.28676 30.9065 1.75751 30.1072 1.33626C29.3727 0.925821 28.5572 0.607189 27.6608 0.380366C26.7643 0.142742 25.8084 0.0239303 24.7931 0.0239301L18.9605 0.0239291L18.9605 23.6135ZM22.8975 3.19945L24.7931 3.19945C25.4195 3.21025 26.0028 3.28586 26.5428 3.42627C27.0829 3.55588 27.5689 3.7449 28.001 3.99333C28.595 4.32816 29.1081 4.76561 29.5401 5.30566C29.9722 5.83491 30.3178 6.42897 30.577 7.08784C30.7823 7.62789 30.9389 8.21655 31.0469 8.85382C31.1549 9.49108 31.2089 10.1661 31.2089 10.879L31.2089 12.7584C31.2089 13.4821 31.1549 14.1625 31.0469 14.7998C30.9389 15.4371 30.7823 16.0257 30.577 16.5658C30.3394 17.2031 30.0316 17.7701 29.6535 18.267C29.2863 18.753 28.8651 19.158 28.3898 19.4821C27.9254 19.7953 27.4015 20.0383 26.8183 20.2112C26.2458 20.3732 25.6139 20.4542 24.9227 20.4542L22.8975 20.4542L22.8975 3.19945Z" />
        <path d="M74.3726 3.24811L74.3726 0.023986L60 0.0239828L60 3.24811L65.2259 3.24811L65.2259 23.6136L69.0981 23.6136L69.0981 3.24811L74.3726 3.24811Z" />
        <path d="M88.8614 17.5379C88.8614 18.0564 88.748 18.5154 88.5212 18.9151C88.3051 19.3147 88.0135 19.6496 87.6463 19.9196C87.2682 20.2004 86.82 20.411 86.3015 20.5514C85.7939 20.6919 85.243 20.7621 84.649 20.7621C83.9469 20.7621 83.2988 20.6757 82.7048 20.5028C82.1215 20.33 81.6139 20.0654 81.1818 19.709C80.739 19.3633 80.3879 18.9259 80.1287 18.3966C79.8803 17.8566 79.7291 17.2247 79.6751 16.501L75.7867 16.501C75.7975 17.6352 76.0243 18.6397 76.4672 19.5145C76.9208 20.3894 77.5311 21.1509 78.2979 21.799C79.1296 22.4902 80.1071 23.0195 81.2304 23.3867C82.3537 23.7432 83.4933 23.9214 84.649 23.9214C85.7399 23.9214 86.7768 23.7864 87.7597 23.5163C88.7426 23.2355 89.6067 22.8197 90.3519 22.2688C91.0864 21.7396 91.6697 21.0753 92.1017 20.276C92.5446 19.4767 92.766 18.5532 92.766 17.5055C92.766 16.3714 92.5122 15.3723 92.0045 14.5082C91.5077 13.6334 90.8434 12.8827 90.0117 12.2562C89.342 11.7594 88.6076 11.3381 87.8083 10.9925C87.0198 10.6361 86.2097 10.339 85.378 10.1014C84.7192 9.90698 84.0873 9.69636 83.4825 9.46954C82.8884 9.24271 82.3591 8.97808 81.8947 8.67565C81.4411 8.37322 81.0792 8.02219 80.8092 7.62255C80.5392 7.21211 80.3987 6.73686 80.3879 6.19681C80.3879 5.68916 80.4906 5.23011 80.6958 4.81967C80.901 4.40923 81.1872 4.05819 81.5545 3.76656C81.9217 3.48573 82.3537 3.26971 82.8506 3.1185C83.3582 2.95648 83.9091 2.87547 84.5032 2.87547C85.1836 2.87547 85.7831 2.97808 86.3015 3.18331C86.8308 3.37772 87.279 3.64775 87.6463 3.99339C88.0027 4.34982 88.2781 4.77647 88.4726 5.27332C88.6778 5.75936 88.8074 6.29942 88.8614 6.89348L92.7174 6.89348C92.7174 5.82417 92.5014 4.85207 92.0693 3.97719C91.6481 3.0915 91.0702 2.33002 90.3357 1.69276C89.6013 1.06629 88.7372 0.580245 87.7435 0.23461C86.7606 -0.121826 85.6967 -0.300044 84.5518 -0.300045C83.4717 -0.300045 82.4402 -0.14883 81.4573 0.1536C80.4852 0.44523 79.6319 0.871872 78.8974 1.43353C78.1629 2.00599 77.5797 2.69725 77.1476 3.50734C76.7156 4.30662 76.4996 5.20851 76.4996 6.21301C76.4996 7.1419 76.6832 7.97898 77.0504 8.72426C77.4284 9.45873 77.9469 10.1176 78.6058 10.7009C79.2646 11.2733 80.0585 11.7918 80.9874 12.2562C81.9271 12.7099 82.9532 13.0933 84.0657 13.4065C84.7894 13.6118 85.4429 13.844 86.0261 14.1032C86.6202 14.3516 87.1332 14.6325 87.5653 14.9457C87.9757 15.2805 88.2943 15.6586 88.5212 16.0798C88.748 16.501 88.8614 16.9871 88.8614 17.5379Z" />
      </g>
      <defs>
        <filter
          id="filter0_d_44_57"
          x="33"
          y="-1.97705"
          width="28"
          height="26"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="2" />
          <feGaussianBlur stdDeviation="2" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.15 0"
          />
          <feBlend
            mode="normal"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_44_57"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_44_57"
            result="shape"
          />
        </filter>
        <clipPath id="clip0_44_57">
          <rect width="93" height="24" />
        </clipPath>
      </defs>
    </svg>
  )
}

/**
 * A component that displays the MDXTS logo that links to the MDXTS website.
 * @internal
 */
export function MdxtsLogoLink({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <a
      href="https://www.mdxts.dev"
      rel="noopener"
      target="_blank"
      className={className}
      style={{ display: 'flex', ...style }}
    >
      <MdxtsLogo style={{ width: undefined, height: '100%' }} />
    </a>
  )
}

/**
 * A component that displays a "Built with MDXTS" message.
 * @internal
 */
export function BuiltWithMdxts({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <a
      href="https://www.mdxts.dev"
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25lh',
        ...style,
      }}
    >
      <span>Built with</span>
      <MdxtsLogo />
    </a>
  )
}
