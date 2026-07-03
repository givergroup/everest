export async function onRequestPost(context) {
  const { request, env } = context;
  
  // 1. ดึงข้อมูล IP ของผู้สมัคร
  const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

  try {
    // รับข้อมูลจากหน้าฟอร์ม
    const { username, name_th, name_en, phone, line_url, register_link, image_url } = await request.json();

    // 2. ดึงค่าคอนฟิก GitHub จาก Environment Variables
    const GITHUB_TOKEN = env.GITHUB_TOKEN; 
    const REPO_OWNER = 'givergroup';
    const REPO_NAME = 'everest';
    const FILE_PATH = 'data/members.json';

    if (!GITHUB_TOKEN) {
      return new Response(JSON.stringify({ message: "ระบบยังไม่ได้ตั้งค่า GitHub Token" }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. เรียกดูข้อมูลไฟล์ members.json ปัจจุบันจาก GitHub
    const githubUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
    
    const githubRes = await fetch(githubUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Pages-Function',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!githubRes.ok) {
      return new Response(JSON.stringify({ message: "ไม่สามารถดึงข้อมูลจาก GitHub ได้" }), { status: 500 });
    }

    const githubData = await githubRes.json();
    const sha = githubData.sha; // เก็บ SHA ไว้ใช้ตอนบันทึกกลับ
    
    // แปลงข้อมูล Base64 จาก GitHub ออกมาเป็นข้อความ JSON
    const fileContent = atob(githubData.content.replace(/\n/g, ''));
    const membersData = JSON.parse(fileContent);

    // 4. ตรวจสอบข้อมูลซ้ำ
    if (membersData[username]) {
      return new Response(JSON.stringify({ message: 'Username นี้ถูกใช้ไปแล้ว กรุณาใช้ชื่ออื่น' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const isPhoneDuplicate = Object.values(membersData).some(member => member.phone === phone);
    if (isPhoneDuplicate) {
      return new Response(JSON.stringify({ message: 'เบอร์โทรศัพท์นี้เคยลงทะเบียนในระบบแล้ว' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 5. เพิ่มสมาชิกใหม่
    membersData[username] = {
      name_th,
      name_en,
      phone,
      line_url,
      register_link,
      image_url
    };

    // แปลงข้อมูลกลับเป็น Base64 (รองรับอักขระภาษาไทยอย่างถูกต้อง)
    const updatedJsonString = JSON.stringify(membersData, null, 2);
    const utf8Bytes = new TextEncoder().encode(updatedJsonString);
    const base64Content = btoa(String.fromCharCode(...utf8Bytes));

    // 6. ส่งข้อมูลที่อัปเดตกลับไปบันทึกบน GitHub (Auto Commit)
    const updateRes = await fetch(githubUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Pages-Function',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `🤖 บอทระบบ: เพิ่มสมาชิกใหม่คุณ ${name_en} (${username})`,
        content: base64Content,
        sha: sha
      })
    });

    if (!updateRes.ok) {
      return new Response(JSON.stringify({ message: "บันทึกข้อมูลลง GitHub ไม่สำเร็จ" }), { status: 500 });
    }

    // 7. ส่งผลลัพธ์กลับไปที่หน้าฟอร์ม
    return new Response(JSON.stringify({
      message: 'ลงทะเบียนสำเร็จ',
      web_url: `https://everest191.com/?ref=${username}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ message: 'เกิดข้อผิดพลาดภายในระบบ: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
