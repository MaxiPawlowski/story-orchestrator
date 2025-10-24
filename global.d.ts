export { };
import "../../../../public/global";
import "../../../../global";



declare global {

  interface CustomToastr {
    success?: (...args: any[]) => any;
    info?: (...args: any[]) => any;
  }
  interface Window {
    toastr?: typeof window.toastr & CustomToastr;
  }
}