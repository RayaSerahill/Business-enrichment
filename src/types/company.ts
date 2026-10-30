export type CodedValue = {
  code: string | null;
  description: string | null;
};

export type CompanyAddress = {
  street: string | null;
  postOfficeBox: string | null;
  careOf: string | null;
  postCode: string | null;
  city: string | null;
  country: string | null;
};

export type TradeRegisterStatus =
  'unregistered' | 'registered' | 'removed' | 'startup_not_registered' | 'ceased';

export type BusinessIdStatus = 'pending' | 'valid' | 'invalidated';

export type CompanySituation = 'liquidation' | 'bankruptcy' | 'reorganisation';

export type Company = {
  businessId: string;
  name: string | null;
  legalForm: CodedValue;
  industry: CodedValue;
  address: CompanyAddress | null;
  postalAddress: CompanyAddress | null;
  website: string | null;
  registrationDate: string | null;
  endDate: string | null;
  tradeRegisterStatus: TradeRegisterStatus | null;
  businessIdStatus: BusinessIdStatus | null;
  situations: CompanySituation[];
  vatRegistered: boolean;
  isActive: boolean;
};
