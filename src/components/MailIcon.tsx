import mailImage from '../assets/images/mailimage.png';

type MailIconProps = {
  className?: string;
  /** Pixel size (width & height). Default 22 to match former emoji in labels. */
  size?: number;
};

export function MailIcon({ className = '', size = 22 }: MailIconProps) {
  return (
    <img
      src={mailImage}
      alt=""
      width={size}
      height={size}
      className={className ? `mail-icon-img ${className}` : 'mail-icon-img'}
      decoding="async"
      role="presentation"
    />
  );
}
