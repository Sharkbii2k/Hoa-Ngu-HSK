# Hoa Ngu HSK Firebase

Ban nay da duoc nang cap de dong bo tai khoan va du lieu giua nhieu thiet bi bang Firebase Auth + Firestore.

## Co gi moi
- Dang nhap dang ky bang Firebase Auth
- Ho so user, VIP, trang thai khoa mo duoc luu tren Firestore
- Admin tao tai khoan cho user khac, may khac dang nhap duoc
- Lich su hoc va tien do hoc dong bo giua cac thiet bi
- Van chay duoc tren GitHub Pages

## Cach setup nhanh
1. Tao project Firebase
2. Bat Authentication -> Email/Password
3. Tao Firestore Database
4. Dan config vao file `firebase-config.js`
5. Dan rules trong `firebase-rules.txt` vao Firestore Rules va publish
6. Up toan bo source len GitHub
7. Mo app. Tai khoan dang ky dau tien se duoc gan role admin

## Luu y
- Username dang nhap duoc chuyen thanh email noi bo dang `username@hoanguhsk.app`
- File `data/*.json` la bo du lieu HSK app se doc truc tiep
- Apple Touch Icon da tro den `assets/icon-192.png`

## Tạo admin dau tien
- Dang ky mot tai khoan moi trong app
- Neu he thong chua co admin, tai khoan dau tien se tro thanh admin

## Kiem tra nhanh sau khi setup
- Dang ky tai khoan dau tien -> vao Control Admin
- Admin tao user khach moi
- Dung dien thoai khac dang nhap bang tai khoan vua tao
- VIP va trang thai khoa mo se dong bo giua cac may
