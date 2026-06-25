from datetime import datetime
from db_connect import mydb
import get_temp
import schedule
import time

mycursor = mydb.cursor()

def report_temp():
  # Get the current time
  current_datetime = datetime.now()
  dt_string = current_datetime.strftime("%Y/%m/%d %H:%M:%S")

  # Get the current temp
  current_temp = get_temp.read_temp()

  sql = "INSERT INTO Sensor_Readings (sensor_id, date_time, temp) VALUES (%s, %s, %s)"
  values = (1, dt_string, current_temp)
  mycursor.execute(sql, values)

  mydb.commit()

  print(current_temp)
  print(dt_string)
  print(mycursor.rowcount, "record inserted")

schedule.every(15).minutes.do(report_temp)

while True: 
  schedule.run_pending()
  time.sleep(1)

  