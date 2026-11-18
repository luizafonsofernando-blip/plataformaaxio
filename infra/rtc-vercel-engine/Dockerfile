FROM maven:3.9-eclipse-temurin-21 AS build
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch 1.6.1 \
    https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git /src \
    && test "$(git -C /src rev-parse HEAD)" = "150cccbe414d4a5edea703e4f7a424af5aa222c7"
WORKDIR /src
RUN mkdir -p calculadora/db \
    && mvn flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf --batch-mode --errors \
    && mvn clean test package --batch-mode --errors

FROM eclipse-temurin:21-jre AS jre
FROM node:24-bookworm-slim
COPY --from=jre /opt/java/openjdk /opt/java/openjdk
COPY --from=build /src/target/api-regime-geral.jar /opt/rtc/app.jar
COPY --from=build /src/calculadora/db/calculadora-pro.db /opt/rtc/calculadora/db/calculadora-pro.db
COPY --from=build /src/LICENSE /opt/rtc/LICENSE
COPY server.mjs /opt/rtc/server.mjs
ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:$PATH \
    SPRING_PROFILES_ACTIVE=offline \
    RTC_REGULAR_UPSTREAM=http://127.0.0.1:8081 \
    PORT=8080
WORKDIR /opt/rtc
USER node
EXPOSE 8080
CMD ["sh", "-c", "java -jar app.jar --server.port=8081 --server.address=127.0.0.1 & exec node server.mjs"]
