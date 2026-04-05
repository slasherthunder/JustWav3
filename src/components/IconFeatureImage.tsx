import iconImage from '../assets/images/iconimage.png';

type IconFeatureImageProps = {
  className?: string;
  size?: number;
};

/** Replaces the former 🎨 emoji for Icons mode and related UI. */
export function IconFeatureImage({ className = '', size = 22 }: IconFeatureImageProps) {
  return (
    <img
      src={iconImage}
      alt=""
      width={size}
      height={size}
      className={className ? `icon-feature-img ${className}` : 'icon-feature-img'}
      decoding="async"
      role="presentation"
    />
  );
}
