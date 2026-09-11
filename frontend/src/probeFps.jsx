// Probe tam: render truc tiep FpSheetPreviewContent (to CHI BAN A4) de chup anh
// kiem tra bo cuc. Khong dung cho app that.
import { createRoot } from 'react-dom/client'
import './styles.css'
import { FpSheetPreviewContent } from './capture/FpSheetPreview.jsx'
import { LanguageProvider } from './i18n'

const form = {
  fp_sheet_no: '123',
  record_date: '11/09/2026',
  record_scope: 'local',
  fp_formula: '',
  full_name: 'Nguyễn Văn A',
  gender: 'male',
  dob: '1990-01-02',
  cccd_number: '001090000123',
  address: '12 Lê Lợi, P. Bến Nghé, Q.1, TP. Hồ Chí Minh',
  temp_address: '12 Lê Lợi, P. Bến Nghé, Q.1',
  current_address: '12 Lê Lợi, P. Bến Nghé, Q.1',
  case_about: 'Cấp CCCD gắn chíp',
  officer_name: 'Trần Thị B',
  officer_classifier: 'Lê Văn C',
  officer_sorter: 'Phạm D',
  officer_class_checker: 'Hoàng E',
}

createRoot(document.getElementById('root')).render(
  <LanguageProvider>
    <FpSheetPreviewContent form={form} photos={{}} unitName="CA Q.1" />
  </LanguageProvider>
)
