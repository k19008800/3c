export interface RegisterForm {
  vendorName: string
  companyName: string
  baseUrl: string
  contactName: string
  contactPhone: string
  contactEmail: string
  password: string
  confirmPassword: string
  description: string
  businessLicense: File | null
  serviceCertification: string
}

export interface FormErrors {
  [key: string]: string
}

export const INITIAL_FORM: RegisterForm = {
  vendorName: '',
  companyName: '',
  baseUrl: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  password: '',
  confirmPassword: '',
  description: '',
  businessLicense: null,
  serviceCertification: '',
}
