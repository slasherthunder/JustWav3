import simplifyImage from '../assets/images/simplifyimage.png';

type SimplifyIconProps = {
  className?: string;
  /** Pixel size (width & height). */
  size?: number;
};

export function SimplifyIcon({ className = '', size = 22 }: SimplifyIconProps) {
  return (
    <img
      src={simplifyImage}
      alt=""
      width={size}
      height={size}
      className={className ? `simplify-icon-img ${className}` : 'simplify-icon-img'}
      decoding="async"
      role="presentation"
    />
  );
}
