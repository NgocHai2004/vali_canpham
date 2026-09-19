"""Test kiểm tra tính đúng đắn của việc tổ chức thư mục ảnh theo can phạm."""

import os
import sys
import shutil

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config import UPLOAD_DIR, TMP_UPLOAD_DIR, DETAINEES_UPLOAD_DIR
from helpers import sanitize_folder_name, commit_detainee_file, commit_detainee_photos


def test_storage():
    print("=" * 60)
    print("[*] KIỂM TRA TỔ CHỨC THƯ MỤC ẢNH THEO CAN PHẠM")
    print("=" * 60)

    # 1. Test sanitize_folder_name
    test_cases = [
        ("CP2026/001", "CP2026_001"),
        ("CP:123*456", "CP_123_456"),
        (" Nguyễn Văn A ", "Nguyễn_Văn_A"),
        ("", "unnamed"),
    ]
    for raw, expected in test_cases:
        res = sanitize_folder_name(raw)
        assert res == expected, f"Lỗi sanitize: {raw} -> {res} (mong đợi {expected})"
    print("[✓] Pass: Test sanitize_folder_name")

    # 2. Test commit_detainee_file (tạo file giả lập trong tmp và di chuyển)
    test_pid = "TEST_CP_9999"
    clean_pid = sanitize_folder_name(test_pid)
    os.makedirs(TMP_UPLOAD_DIR, exist_ok=True)

    fake_filename = "test_fake_photo.jpg"
    fake_tmp_path = os.path.join(TMP_UPLOAD_DIR, fake_filename)
    with open(fake_tmp_path, "wb") as f:
        f.write(b"FAKE_IMAGE_DATA_12345")

    fake_url = f"/uploads/tmp/{fake_filename}"
    new_url = commit_detainee_file(fake_url, test_pid)

    expected_target_dir = os.path.join(DETAINEES_UPLOAD_DIR, clean_pid)
    expected_target_file = os.path.join(expected_target_dir, fake_filename)

    assert os.path.isfile(expected_target_file), f"File không tồn tại ở {expected_target_file}"
    assert not os.path.isfile(fake_tmp_path), f"File cũ trong tmp vẫn còn!"
    assert new_url == f"/uploads/detainees/{clean_pid}/{fake_filename}", f"URL sai: {new_url}"
    print("[✓] Pass: Test commit_detainee_file")

    # 3. Test commit_detainee_photos
    fake_fp_file = "test_fake_fp.jpg"
    fake_fp_path = os.path.join(TMP_UPLOAD_DIR, fake_fp_file)
    with open(fake_fp_path, "wb") as f:
        f.write(b"FAKE_FP_DATA")

    photos_dict = {
        "portrait_front": new_url,  # Đã nằm đúng thư mục
        "left_thumb": f"/uploads/tmp/{fake_fp_file}",  # Còn trong tmp
        "fingerprints": {
            "right_thumb": f"/uploads/tmp/{fake_fp_file}",
        },
        "face_embedding": [0.1, 0.2, 0.3],
    }

    res_photos = commit_detainee_photos(photos_dict, test_pid)
    assert res_photos["portrait_front"] == new_url
    assert res_photos["left_thumb"].startswith(f"/uploads/detainees/{clean_pid}/")
    assert res_photos["face_embedding"] == [0.1, 0.2, 0.3]
    print("[✓] Pass: Test commit_detainee_photos")

    # Dọn dẹp dữ liệu test
    if os.path.isdir(expected_target_dir):
        shutil.rmtree(expected_target_dir)

    print("=" * 60)
    print("[✓] TẤT CẢ CÁC BÀI TEST LƯU TRỮ ĐỀU THÀNH CÔNG!")
    print("=" * 60)


if __name__ == "__main__":
    test_storage()
